"""Отправка email через SMTP (подтверждение смены адреса и т.п.).

Если SMTP не настроен (SMTP_HOST пуст), письма не отправляются — код/ссылка
пишется в лог. Это удобно в dev-режиме: ничего не падает, а значение видно
в консоли сервера.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailError(Exception):
    """Ошибка отправки письма."""


def _send_sync(to: str, subject: str, body: str) -> None:
    """Блокирующая отправка одного письма. Вызывать через run_in_executor."""
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    if settings.SMTP_TLS:
        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            server.starttls(context=context)
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> None:
    """Отправить письмо. Если SMTP не настроен — лог вместо отправки (dev)."""
    if not settings.SMTP_HOST:
        logger.warning(
            "[EMAIL DISABLED] SMTP не настроен. Письмо для %s НЕ отправлено.\n"
            "Тема: %s\nТело:\n%s",
            to, subject, body,
        )
        return

    import asyncio

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _send_sync, to, subject, body)
        logger.info("Email отправлено на %s (тема: %s)", to, subject)
    except Exception as e:  # noqa: BLE001
        logger.exception("Не удалось отправить email на %s", to)
        raise EmailError(str(e)) from e


async def send_email_change_code(to: str, code: str) -> None:
    """Письмо с кодом подтверждения смены email."""
    subject = "Aegis — подтверждение смены email"
    body = (
        "Здравствуйте!\n\n"
        "Вы запросили смену адреса электронной почты в Aegis.\n"
        f"Ваш код подтверждения: {code}\n\n"
        "Введите его в приложении, чтобы завершить смену email.\n"
        "Код действителен 30 минут.\n\n"
        "Если вы не запрашивали смену — просто проигнорируйте это письмо."
    )
    await send_email(to, subject, body)


async def send_verification_code(to: str, code: str) -> None:
    """Письмо с кодом подтверждения регистрации."""
    subject = "Aegis — подтверждение регистрации"
    body = (
        "Здравствуйте!\n\n"
        "Вы зарегистрировались в библиотеке Aegis.\n"
        f"Ваш код подтверждения: {code}\n\n"
        "Введите его в приложении, чтобы активировать аккаунт.\n"
        "Код действителен 30 минут.\n\n"
        "Если вы не регистрировались — просто проигнорируйте это письмо."
    )
    await send_email(to, subject, body)


async def send_admin_new_registration(username: str, email: str, full_name: str | None) -> None:
    """Уведомить администратора о новом пользователе, ожидающем одобрения."""
    admin_to = getattr(settings, "ADMIN_NOTIFY_EMAIL", None) or "vash.kosha@gmail.com"
    subject = "Aegis — новая заявка на регистрацию"
    fio = full_name or "(не указано)"
    body = (
        "Новый пользователь подтвердил email и ожидает одобрения:\n\n"
        f"Логин: {username}\n"
        f"ФИО: {fio}\n"
        f"Email: {email}\n\n"
        "Зайдите в админ-панель → вкладка «Пользователи» → «Заявки», чтобы одобрить или отклонить."
    )
    await send_email(admin_to, subject, body)


async def send_approval_notification(to: str, full_name: str | None) -> None:
    """Уведомить пользователя, что его регистрация одобрена и доступ открыт."""
    name = full_name or "пользователь"
    subject = "Aegis — доступ к библиотеке открыт"
    body = (
        f"Здравствуйте, {name}!\n\n"
        "Ваша регистрация в Aegis одобрена администратором. "
        "Теперь вам доступна вся библиотека материалов по кибербезопасности.\n\n"
        f"Войти: {settings.FRONTEND_BASE_URL}\n\n"
        "Приятного обучения!\n"
        "Команда Aegis"
    )
    await send_email(to, subject, body)


async def send_password_reset_code(to: str, code: str) -> None:
    """Отправить код для восстановления пароля."""
    subject = "Aegis — восстановление пароля"
    body = (
        "Вы запросили восстановление пароля в Aegis.\n\n"
        f"Ваш код для сброса пароля: {code}\n\n"
        "Код действителен 30 минут. Если вы не запрашивали сброс пароля, "
        "просто проигнорируйте это письмо — ваш пароль останется прежним."
    )
    await send_email(to, subject, body)