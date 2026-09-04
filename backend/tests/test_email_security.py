"""Регрессии безопасной конфигурации email и логирования писем."""

import logging

import pytest
from sqlalchemy import select

from app.api import auth
from app.models.user import User
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


@pytest.mark.asyncio
async def test_registration_reports_delivery_failure(client, db, monkeypatch):
    async def fail_delivery(_to, _code):
        raise email_service.EmailError("SMTP unavailable")

    monkeypatch.setattr(auth, "send_verification_code", fail_delivery)
    response = await client.post(
        "/auth/register",
        json={
            "username": "mailfailure",
            "password": "TestPass123!",
            "email": "mailfailure@example.com",
        },
    )

    assert response.status_code == 502
    assert "Аккаунт создан" in response.json()["detail"]
    user = await db.scalar(select(User).where(User.username == "mailfailure"))
    assert user is not None
    assert user.is_verified is False
