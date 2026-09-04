"""Уведомления о падении сервисов: валидация, throttling и секретность."""
from __future__ import annotations

import pytest

from app import service_alert


@pytest.mark.asyncio
async def test_sends_fixed_safe_message(monkeypatch, tmp_path):
    sent = {}

    async def fake_send(to, subject, body):
        sent.update(to=to, subject=subject, body=body)

    monkeypatch.setattr(service_alert, "_STATE_DIR", tmp_path)
    monkeypatch.setattr(service_alert.settings, "ADMIN_NOTIFY_EMAIL", "ops@example.test")
    monkeypatch.setattr(service_alert, "send_email", fake_send)

    assert await service_alert.notify("aegis-worker.service") == 0
    assert sent["to"] == "ops@example.test"
    assert "aegis-worker.service" in sent["subject"]
    assert "journalctl -u aegis-worker.service" in sent["body"]


@pytest.mark.asyncio
async def test_rejects_untrusted_unit_name(monkeypatch, tmp_path):
    monkeypatch.setattr(service_alert, "_STATE_DIR", tmp_path)
    monkeypatch.setattr(service_alert.settings, "ADMIN_NOTIFY_EMAIL", "ops@example.test")

    assert await service_alert.notify("aegis.service;cat /etc/passwd") == 2


def test_throttles_same_unit(monkeypatch, tmp_path):
    monkeypatch.setattr(service_alert, "_STATE_DIR", tmp_path)

    assert service_alert._should_send("aegis.service", now=1000)
    assert not service_alert._should_send("aegis.service", now=1001)
    assert service_alert._should_send("aegis.service", now=1000 + 15 * 60)
