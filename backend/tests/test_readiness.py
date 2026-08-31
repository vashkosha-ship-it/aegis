"""Тесты health и readiness.

Разделение важно: /health отвечает на вопрос «процесс жив» (по нему systemd
решает, перезапускать ли сервис), /ready — «может ли приложение обслуживать
запросы». Смешивать их нельзя: при недоступной базе systemd начал бы
перезапускать вполне здоровый процесс.

Пути с «../»: тестовый клиент настроен на https://test/api, а health-эндпоинты
живут в корне приложения, вне префикса /api.
"""
from __future__ import annotations


class TestHealth:
    async def test_health_is_fast_and_simple(self, client):
        """Liveness не должен зависеть от базы."""
        r = await client.get("../health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestReadiness:
    async def test_ready_reports_dependencies(self, client):
        r = await client.get("../ready")
        assert r.status_code == 200

        body = r.json()
        # ready или degraded — оба означают, что запросы обслуживаются.
        # degraded появляется, когда не работает необязательная часть: в тестах
        # это обычно очередь, которую никто не поднимал. Раньше такой сайт
        # выглядел полностью здоровым, теперь состояние видно в ответе.
        assert body["status"] in ("ready", "degraded"), body
        assert "database" in body["checks"]
        assert body["checks"]["database"]["ok"] is True

    async def test_degraded_never_means_required_failure(self, client):
        """Обязательные части при degraded обязаны быть в порядке.

        Иначе смысл состояния теряется: degraded — это «работает с
        ограничениями», а не «частично сломано».
        """
        body = (await client.get("../ready")).json()
        if body["status"] != "degraded":
            return

        for name, check in body["checks"].items():
            if check.get("required", True):
                assert check["ok"] is True, f"обязательная часть {name} не в порядке"

    async def test_ready_lists_all_components(self, client):
        r = await client.get("../ready")
        checks = r.json()["checks"]

        for component in ("database", "redis", "storage", "queue"):
            assert component in checks, f"нет проверки {component}"

    async def test_queue_is_optional(self, client):
        """Без очереди сайт работает: не идёт только индексация книг."""
        r = await client.get("../ready")
        assert r.json()["checks"]["queue"]["required"] is False
