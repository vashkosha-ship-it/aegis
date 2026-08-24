"""Определение IP клиента за обратным прокси.

Приложение слушает 127.0.0.1 и получает запросы от nginx, поэтому
request.client.host для всех одинаков — это адрес прокси. Rate limit «по IP»
в таком виде считал всех пользователей как одного: активный человек мог
случайно заблокировать вход всем остальным.

Реальный адрес nginx передаёт в X-Forwarded-For. Доверять этому заголовку
можно только если запрос действительно пришёл от нашего прокси: клиент может
прислать его сам и подделать свой адрес, обойдя любые лимиты.
"""
from __future__ import annotations

import ipaddress
import logging

from fastapi import Request

logger = logging.getLogger(__name__)

# Адреса, от которых мы принимаем X-Forwarded-For. Наш nginx ходит с
# localhost; сети RFC1918 добавлены на случай контейнерного развёртывания.
TRUSTED_PROXIES = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)

UNKNOWN = "unknown"


def _is_trusted(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return any(ip in net for net in TRUSTED_PROXIES)


def get_client_ip(request: Request) -> str:
    """Вернуть адрес клиента.

    Если запрос пришёл напрямую (не от доверенного прокси), заголовки
    игнорируются: иначе кто угодно подставил бы себе чужой или случайный IP.
    """
    peer = request.client.host if request.client else None
    if not peer:
        return UNKNOWN

    if not _is_trusted(peer):
        # Прямое подключение — верим только фактическому адресу
        return peer

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Цепочка вида "клиент, прокси1, прокси2" — нужен первый элемент.
        # Он может быть подделан клиентом, но дальше по цепочке идут наши
        # прокси, а первый прокси затирает чужие значения своим.
        candidate = forwarded.split(",")[0].strip()
        try:
            ipaddress.ip_address(candidate)
            return candidate
        except ValueError:
            logger.warning("Некорректный X-Forwarded-For: %r", forwarded[:120])

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        try:
            ipaddress.ip_address(real_ip.strip())
            return real_ip.strip()
        except ValueError:
            logger.warning("Некорректный X-Real-IP: %r", real_ip[:120])

    return peer
