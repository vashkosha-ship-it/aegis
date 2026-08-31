"""Readiness должен ловить то, из-за чего сайт действительно ломается.

Проверка хранилища раньше сводилась к os.access(path, os.R_OK): каталог
существует и читается. Но ломается хранилище иначе — закончилось место, том
перемонтировался в read-only после ошибки диска, права слетели при переносе.
Во всех этих случаях /ready отвечал «готово», а загрузка книг падала.

Отдельно проверяется поведение при неработающей очереди: сервис остаётся
готовым (читать и проходить тесты можно), но помечается как работающий с
ограничениями — иначе это состояние выглядит полностью здоровым.
"""
from __future__ import annotations

import os

import pytest

from app import main

# Пути с «../»: тестовый клиент настроен на https://test/api, а health-эндпоинты
# живут в корне приложения, вне префикса /api.


@pytest.fixture
def storage_dir(tmp_path, monkeypatch):
    """Временный каталог как хранилище книг."""
    path = tmp_path / "storage"
    path.mkdir()
    monkeypatch.setattr(main.settings, "STORAGE_LOCAL_PATH", str(path))
    monkeypatch.setattr(main.settings, "STORAGE_BACKEND", "local")
    return path


class TestStorageWriteCheck:
    async def test_writable_storage_is_ok(self, storage_dir):
        result = await main._check_storage()
        assert result["ok"] is True

    async def test_probe_file_is_cleaned_up(self, storage_dir):
        """Проверка не должна оставлять мусор: её вызывают постоянно."""
        await main._check_storage()
        assert list(storage_dir.iterdir()) == []

    async def test_missing_directory_detected(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            main.settings, "STORAGE_LOCAL_PATH", str(tmp_path / "нет-такого")
        )
        monkeypatch.setattr(main.settings, "STORAGE_BACKEND", "local")

        result = await main._check_storage()
        assert result["ok"] is False

    async def test_unwritable_storage_detected(self, storage_dir, monkeypatch):
        """Главное: каталог читается, но записать в него нельзя.

        Ровно этот случай прежняя проверка пропускала — например, том
        перемонтирован в read-only.
        """
        def _readonly(path: str) -> None:
            raise OSError(30, "Read-only file system")

        monkeypatch.setattr(main, "_probe_storage_write", _readonly)

        result = await main._check_storage()
        assert result["ok"] is False
        assert result.get("note") == "нет записи"

    async def test_disk_full_detected(self, storage_dir, monkeypatch):
        def _no_space(path: str) -> None:
            raise OSError(28, "No space left on device")

        monkeypatch.setattr(main, "_probe_storage_write", _no_space)

        result = await main._check_storage()
        assert result["ok"] is False

    async def test_readable_but_unwritable_would_pass_old_check(self, storage_dir):
        """Фиксируем разницу между старой и новой проверкой.

        os.access(..., R_OK) на существующем каталоге истинен всегда, поэтому
        сам по себе он ничего о работоспособности хранилища не говорит.
        """
        assert os.access(str(storage_dir), os.R_OK) is True

    async def test_external_backend_not_probed(self, tmp_path, monkeypatch):
        """Для S3 запись файлов на диск ничего не проверяет."""
        monkeypatch.setattr(main.settings, "STORAGE_BACKEND", "s3")
        monkeypatch.setattr(main.settings, "STORAGE_LOCAL_PATH", str(tmp_path))

        result = await main._check_storage()
        assert result["ok"] is True
        assert "backend=s3" in result.get("note", "")


@pytest.fixture
def healthy_deps(monkeypatch):
    """Считать обязательные части исправными.

    Тесты ниже про семантику degraded, а не про доступность базы. Реальная
    проверка базы открывает собственную сессию мимо тестовой и ведёт себя
    нестабильно (см. RuntimeWarning про Connection._cancel) — из-за неё тест
    падал бы по причине, к предмету проверки не относящейся.
    """
    async def _ok():
        return {"ok": True}

    monkeypatch.setattr(main, "_check_database", _ok)
    monkeypatch.setattr(main, "_check_redis", _ok)
    monkeypatch.setattr(main, "_check_storage", _ok)


class TestQueueDegradation:
    async def test_check_failure_does_not_break_endpoint(self, client, monkeypatch, healthy_deps):
        """Сломавшаяся проверка не должна превращаться в пятисотку.

        Эндпоинт готовности существует, чтобы сообщать о проблемах. Если он
        сам отвечает ошибкой, мониторинг не может отличить недоступность
        сервиса от неисправности проверки.
        """
        async def _boom():
            raise ConnectionError("Redis недоступен")

        monkeypatch.setattr(main, "_check_queue", _boom)

        r = await client.get("../ready")
        assert r.status_code == 200, r.text
        assert r.json()["checks"]["queue"]["ok"] is False

    async def test_unavailable_queue_marks_degraded(self, client, monkeypatch, healthy_deps):
        async def _unavailable():
            return {"ok": False, "required": False, "note": "не настроена"}

        monkeypatch.setattr(main, "_check_queue", _unavailable)

        r = await client.get("../ready")
        body = r.json()

        assert r.status_code == 200, (
            f"очередь не должна снимать сервер с ротации; ответ: {r.text}"
        )
        assert body["status"] == "degraded", (
            "неработающая индексация не должна выглядеть как полное здоровье"
        )
        assert "queue" in body.get("degraded", [])

    async def test_healthy_queue_gives_plain_ready(self, client, monkeypatch, healthy_deps):
        async def _fine():
            return {"ok": True, "required": False}

        monkeypatch.setattr(main, "_check_queue", _fine)

        r = await client.get("../ready")
        body = r.json()

        assert r.status_code == 200
        assert body["status"] == "ready"
        assert "degraded" not in body

    async def test_queue_can_be_made_required(self, client, monkeypatch, healthy_deps):
        """Переключатель существует и работает.

        Если индексация окажется критичной, поведение меняется одной
        константой, а не переписыванием проверки.
        """
        async def _unavailable():
            return {"ok": False, "required": True}

        monkeypatch.setattr(main, "_check_queue", _unavailable)

        r = await client.get("../ready")
        assert r.status_code == 503
        assert r.json()["status"] == "not ready"


class TestRequiredComponents:
    async def test_broken_storage_makes_not_ready(self, client, monkeypatch):
        async def _broken():
            return {"ok": False, "note": "нет записи"}

        monkeypatch.setattr(main, "_check_storage", _broken)

        r = await client.get("../ready")
        assert r.status_code == 503
        assert r.json()["status"] == "not ready"

    async def test_broken_database_makes_not_ready(self, client, monkeypatch):
        async def _broken():
            return {"ok": False}

        monkeypatch.setattr(main, "_check_database", _broken)

        r = await client.get("../ready")
        assert r.status_code == 503

    async def test_response_never_leaks_internals(self, client, monkeypatch):
        """/ready доступен без авторизации — адресов и портов в нём быть не должно."""
        async def _broken():
            return {"ok": False}

        monkeypatch.setattr(main, "_check_database", _broken)

        r = await client.get("../ready")
        text = r.text.lower()

        for leak in ("postgresql", "asyncpg", "password", "5432", "127.0.0.1"):
            assert leak not in text, f"в ответе /ready утекло: {leak}"
