"""Регрессии безопасной конфигурации email и логирования писем."""

import logging

import pytest

from app.services import email_service


def test_production_requires_smtp(monkeypatch):
    monkeypatch.setattr(email_service.settings, "DEBUG", False)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "")

    with pytest.raises(email_service.EmailConfigurationError):
        email_service.validate_email_configuration()


def test_development_allows_missing_smtp(monkeypatch):
    monkeypatch.setattr(email_service.settings, "DEBUG", True)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "")

    email_service.validate_email_configuration()


def test_production_accepts_configured_smtp(monkeypatch):
    monkeypatch.setattr(email_service.settings, "DEBUG", False)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "smtp.example.test")

    email_service.validate_email_configuration()


@pytest.mark.asyncio
async def test_disabled_email_never_logs_secret_body(monkeypatch, caplog):
    monkeypatch.setattr(email_service.settings, "DEBUG", True)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "")
    secret = "Код восстановления: 918273"

    with caplog.at_level(logging.WARNING, logger=email_service.__name__):
        await email_service.send_email(
            "reader@example.test",
            "Восстановление доступа",
            secret,
        )

    assert "SMTP не настроен" in caplog.text
    assert secret not in caplog.text
    assert "918273" not in caplog.text
