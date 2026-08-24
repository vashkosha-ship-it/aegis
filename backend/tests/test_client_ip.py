"""Тесты определения IP за обратным прокси.

Без них легко получить одну из двух проблем: либо все пользователи считаются
одним адресом (лимиты общие на всех), либо клиент подделывает заголовок и
обходит лимиты вовсе.
"""
from __future__ import annotations

from unittest.mock import Mock

from app.core.client_ip import get_client_ip


def _request(peer: str | None, headers: dict[str, str] | None = None) -> Mock:
    req = Mock()
    req.client = Mock(host=peer) if peer else None
    req.headers = headers or {}
    return req


class TestTrustedProxy:
    def test_forwarded_used_when_behind_proxy(self):
        """Запрос от nginx (localhost) — берём адрес из заголовка."""
        req = _request("127.0.0.1", {"x-forwarded-for": "203.0.113.7"})
        assert get_client_ip(req) == "203.0.113.7"

    def test_first_entry_of_chain(self):
        """В цепочке нужен исходный клиент, а не промежуточные прокси."""
        req = _request(
            "127.0.0.1", {"x-forwarded-for": "203.0.113.7, 10.0.0.5, 10.0.0.6"}
        )
        assert get_client_ip(req) == "203.0.113.7"

    def test_real_ip_fallback(self):
        req = _request("127.0.0.1", {"x-real-ip": "198.51.100.3"})
        assert get_client_ip(req) == "198.51.100.3"


class TestSpoofing:
    def test_header_ignored_from_untrusted_peer(self):
        """Прямое подключение: заголовку верить нельзя — его подделывают."""
        req = _request("203.0.113.99", {"x-forwarded-for": "1.2.3.4"})
        assert get_client_ip(req) == "203.0.113.99"

    def test_garbage_header_falls_back_to_peer(self):
        req = _request("127.0.0.1", {"x-forwarded-for": "не-адрес"})
        assert get_client_ip(req) == "127.0.0.1"

    def test_empty_chain_falls_back(self):
        req = _request("127.0.0.1", {"x-forwarded-for": ""})
        assert get_client_ip(req) == "127.0.0.1"


class TestEdgeCases:
    def test_no_client_returns_unknown(self):
        assert get_client_ip(_request(None)) == "unknown"

    def test_direct_connection_without_headers(self):
        assert get_client_ip(_request("203.0.113.10")) == "203.0.113.10"
