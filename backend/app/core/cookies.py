"""Работа с cookie аутентификации.

Refresh-токен живёт в httpOnly-cookie, а не в localStorage: JavaScript не
имеет к нему доступа, поэтому XSS не может его украсть. Access-токен
по-прежнему передаётся в теле ответа и хранится клиентом в памяти — он
короткоживущий, и при перезагрузке страницы приложение получает новый через
refresh.

Cookie автоматически отправляется браузером с каждым запросом, поэтому
появляется вектор CSRF, которого не было с заголовком Authorization. Защита
двойная: SameSite=Strict (cookie не уходит при переходе с чужого сайта) и
double-submit токен для запросов, меняющих состояние.
"""
from __future__ import annotations

import secrets

from fastapi import Request, Response

from app.core.config import settings

REFRESH_COOKIE = "aegis_refresh"
CSRF_COOKIE = "aegis_csrf"
CSRF_HEADER = "X-CSRF-Token"


def _cookie_kwargs() -> dict:
    """Общие параметры cookie.

    secure=True в проде: без него cookie уйдёт по http и её увидит любой,
    кто слушает канал. На localhost secure ломает разработку, поэтому там
    выключаем.
    """
    return {
        "httponly": True,
        "secure": not settings.DEBUG,
        "samesite": "strict",
        "path": "/api/auth",
        "max_age": settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    }


def set_auth_cookies(response: Response, refresh_token: str) -> str:
    """Положить refresh в httpOnly-cookie и выдать CSRF-токен.

    Возвращает csrf-токен: он же кладётся в отдельную cookie, доступную
    JavaScript, чтобы клиент мог продублировать его в заголовке.
    """
    kwargs = _cookie_kwargs()
    response.set_cookie(REFRESH_COOKIE, refresh_token, **kwargs)

    csrf = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE,
        csrf,
        httponly=False,  # клиент обязан прочитать и продублировать в заголовке
        secure=not settings.DEBUG,
        samesite="strict",
        path="/",
        max_age=kwargs["max_age"],
    )
    return csrf


def clear_auth_cookies(response: Response) -> None:
    """Удалить cookie при выходе."""
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    response.delete_cookie(CSRF_COOKIE, path="/")


def get_refresh_from_cookie(request: Request) -> str | None:
    return request.cookies.get(REFRESH_COOKIE)


def csrf_is_valid(request: Request) -> bool:
    """Double-submit: значение из cookie должно совпасть с заголовком.

    Смысл в том, что чужой сайт может заставить браузер отправить cookie, но
    не может прочитать её значение, чтобы подставить в заголовок.
    """
    cookie_value = request.cookies.get(CSRF_COOKIE)
    header_value = request.headers.get(CSRF_HEADER)
    if not cookie_value or not header_value:
        return False
    return secrets.compare_digest(cookie_value, header_value)
