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
        assert body["status"] == "ready"
        assert "database" in body["checks"]
        assert body["checks"]["database"]["ok"] is True

    async def test_ready_lists_all_components(self, client):
        r = await client.get("../ready")
        checks = r.json()["checks"]

        for component in ("database", "redis", "storage", "queue"):
            assert component in checks, f"нет проверки {component}"

    async def test_queue_is_optional(self, client):
        """Без очереди сайт работает: не идёт только индексация книг."""
        r = await client.get("../ready")
        assert r.json()["checks"]["queue"]["required"] is False
