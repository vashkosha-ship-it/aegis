"""Выбор ИИ-сервиса по виду работы (DeepSeek / GigaChat) и клиент GigaChat."""
from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.models.admin_log import AdminLog
from app.models.user import UserRole
from app.services import ai_provider, deepseek_client, gigachat_client
from app.services.ai_errors import AIProviderError
from tests.conftest import auth_headers, make_user

OAUTH = "https://ngw.example/api/v2/oauth"
BASE = "https://giga.example/v1"


@pytest.fixture
def giga(monkeypatch):
    """GigaChat с подменённой сетью. Возвращает журнал запросов и настройки ответов."""
    monkeypatch.setattr(settings, "GIGACHAT_AUTH_KEY", "Y2xpZW50OnNlY3JldA==")
    monkeypatch.setattr(settings, "GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
    monkeypatch.setattr(settings, "GIGACHAT_MODEL", "GigaChat-2-Pro")
    monkeypatch.setattr(settings, "GIGACHAT_OAUTH_URL", OAUTH)
    monkeypatch.setattr(settings, "GIGACHAT_BASE_URL", BASE)
    gigachat_client._reset_token()

    state = {"calls": [], "tokens": 0, "reject_first_chat": False, "stream": False}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"].append(request)
        if str(request.url) == OAUTH:
            state["tokens"] += 1
            return httpx.Response(200, json={
                "access_token": f"tok{state['tokens']}",
                "expires_at": int((time.time() + 1800) * 1000),
            })
        if str(request.url) == f"{BASE}/chat/completions":
            if state["reject_first_chat"]:
                state["reject_first_chat"] = False
                return httpx.Response(401, json={"message": "Token has expired"})
            body = json.loads(request.content)
            if body.get("stream"):
                lines = [
                    'data: {"choices":[{"delta":{"content":"При"}}]}',
                    'data: {"choices":[{"delta":{"content":"вет"}}]}',
                    "data: [DONE]",
                ]
                return httpx.Response(200, text="\n\n".join(lines) + "\n\n",
                                      headers={"Content-Type": "text/event-stream"})
            return httpx.Response(200, json={"choices": [{"message": {"content": "Ответ GigaChat"}}]})
        return httpx.Response(404)

    real_client = httpx.AsyncClient

    def client_factory(**kwargs):
        kwargs.pop("verify", None)
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(gigachat_client.httpx, "AsyncClient", client_factory)
    ai_provider.forget()
    yield state
    gigachat_client._reset_token()
    ai_provider.forget()


async def test_gigachat_gets_token_and_answers(giga):
    reply = await gigachat_client.chat_completion(
        [{"role": "system", "content": "s"}, {"role": "user", "content": "q"}],
        max_tokens=100, timeout=10,
    )
    assert reply == "Ответ GigaChat"
    oauth, chat = giga["calls"]
    assert oauth.headers["Authorization"] == "Basic Y2xpZW50OnNlY3JldA=="
    assert oauth.headers["RqUID"]
    assert oauth.content == b"scope=GIGACHAT_API_PERS"
    assert chat.headers["Authorization"] == "Bearer tok1"
    body = json.loads(chat.content)
    assert body["model"] == "GigaChat-2-Pro"
    assert body["messages"][0] == {"role": "system", "content": "s"}

    # Токен живёт 30 минут — второй запрос без повторной авторизации.
    await gigachat_client.chat_completion([{"role": "user", "content": "q"}], max_tokens=10, timeout=10)
    assert giga["tokens"] == 1


async def test_gigachat_refreshes_token_on_401(giga):
    await gigachat_client.chat_completion([{"role": "user", "content": "q"}], max_tokens=10, timeout=10)
    giga["reject_first_chat"] = True
    reply = await gigachat_client.chat_completion([{"role": "user", "content": "q"}], max_tokens=10, timeout=10)
    assert reply == "Ответ GigaChat"
    assert giga["tokens"] == 2


async def test_gigachat_stream(giga):
    pieces = [p async for p in gigachat_client.chat_completion_stream(
        [{"role": "user", "content": "q"}], max_tokens=10,
    )]
    assert "".join(pieces) == "Привет"


async def test_gigachat_without_key_raises(monkeypatch):
    monkeypatch.setattr(settings, "GIGACHAT_AUTH_KEY", "")
    gigachat_client._reset_token()
    with pytest.raises(AIProviderError):
        await gigachat_client.chat_completion([{"role": "user", "content": "q"}], max_tokens=10, timeout=10)


async def test_dispatcher_follows_selected_provider_per_task(giga, monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "sk-test")
    called = []

    async def fake_deepseek(messages, **kwargs):
        called.append("deepseek")
        return "Ответ DeepSeek"

    monkeypatch.setattr(deepseek_client, "_deepseek_completion", fake_deepseek)

    ai_provider.remember(ai_provider.ASSISTANT, "gigachat")
    ai_provider.remember(ai_provider.BOOKS, "deepseek")
    assert await deepseek_client.chat_completion(
        [{"role": "user", "content": "q"}], system_prompt="sys",
    ) == "Ответ GigaChat"
    sent = json.loads(giga["calls"][-1].content)
    assert sent["messages"][0] == {"role": "system", "content": "sys"}
    assert await deepseek_client.chat_completion(
        [{"role": "user", "content": "q"}], task=ai_provider.BOOKS,
    ) == "Ответ DeepSeek"
    assert called == ["deepseek"]

    ai_provider.remember(ai_provider.ASSISTANT, "deepseek")
    assert await deepseek_client.chat_completion([{"role": "user", "content": "q"}]) == "Ответ DeepSeek"


def test_defaults_gigachat_for_users_deepseek_for_books():
    assert ai_provider.default_provider(ai_provider.ASSISTANT) == "gigachat"
    assert ai_provider.default_provider(ai_provider.BOOKS) == "deepseek"


def test_unconfigured_choice_falls_back_to_configured(monkeypatch):
    monkeypatch.setattr(settings, "GIGACHAT_AUTH_KEY", "")
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "sk-test")
    assert ai_provider.effective("gigachat") == "deepseek"
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "")
    assert ai_provider.effective("gigachat") == "gigachat"


async def test_book_services_use_books_task(monkeypatch):
    """Описания, карточки и темы книг — работа books, тесты — assistant."""
    import inspect

    from app.api import books
    from app.services import book_autofill, book_descriptions, certificates, quizzes

    for module in (book_autofill, book_descriptions):
        assert "task=ai_provider.BOOKS" in inspect.getsource(module)
    assert "task=ai_provider.BOOKS" in inspect.getsource(books.ai_match_ar_topics)
    for module in (quizzes, certificates):
        assert "ai_provider.BOOKS" not in inspect.getsource(module)


async def test_admin_switches_provider_per_task(client, db, giga, monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "sk-test")
    admin = await make_user(db, username="ai_admin", role=UserRole.ADMIN)
    reader = await make_user(db, username="ai_reader")

    r = await client.get("/admin/settings/ai", headers=auth_headers(admin))
    assert r.status_code == 200
    data = r.json()
    assert {o["id"]: o["configured"] for o in data["options"]} == {"deepseek": True, "gigachat": True}
    assert {t["task"]: t["selected"] for t in data["tasks"]} == {"assistant": "gigachat", "books": "deepseek"}
    assert (await client.get("/settings", headers=auth_headers(reader))).json()["ai_provider"] == "gigachat"

    assert (await client.get("/admin/settings/ai", headers=auth_headers(reader))).status_code == 403
    r = await client.patch("/admin/settings", json={"ai_provider_books": "gigachat"}, headers=auth_headers(reader))
    assert r.status_code == 403

    r = await client.patch("/admin/settings", json={"ai_provider_books": "gigachat"}, headers=auth_headers(admin))
    assert r.status_code == 200
    tasks = {t["task"]: t["selected"] for t in (await client.get(
        "/admin/settings/ai", headers=auth_headers(admin))).json()["tasks"]}
    assert tasks == {"assistant": "gigachat", "books": "gigachat"}
    assert await ai_provider.current(ai_provider.BOOKS) == "gigachat"

    r = await client.patch("/admin/settings", json={"ai_provider_assistant": "deepseek"}, headers=auth_headers(admin))
    assert r.json()["ai_provider"] == "deepseek"

    from sqlalchemy import select

    logs = (await db.scalars(select(AdminLog).where(AdminLog.action == "ai_provider_switch"))).all()
    details = " | ".join(log.detail for log in logs)
    assert "Обработка книг: описания, карточки, темы: DeepSeek → GigaChat" in details
    assert "Общение с пользователями и тесты: GigaChat → DeepSeek" in details

    r = await client.patch("/admin/settings", json={"ai_provider_books": "openai"}, headers=auth_headers(admin))
    assert r.status_code == 422


async def test_cannot_switch_to_unconfigured_provider(client, db, monkeypatch):
    monkeypatch.setattr(settings, "GIGACHAT_AUTH_KEY", "")
    admin = await make_user(db, username="ai_admin2", role=UserRole.ADMIN)
    r = await client.patch("/admin/settings", json={"ai_provider_books": "gigachat"}, headers=auth_headers(admin))
    assert r.status_code == 400
    assert "не подключён" in r.json()["detail"]
    ai_provider.forget()


def test_gigachat_trusts_extra_root_certificate(monkeypatch, tmp_path):
    """Корневой сертификат Минцифры добавляется к системным, а не вместо них."""
    import ssl

    import certifi

    monkeypatch.setattr(gigachat_client, "DEFAULT_RU_ROOT", tmp_path / "missing.pem")
    monkeypatch.setattr(settings, "GIGACHAT_CA_BUNDLE", "")
    assert gigachat_client._verify() is True

    monkeypatch.setattr(settings, "GIGACHAT_CA_BUNDLE", str(tmp_path / "nope.pem"))
    assert gigachat_client._verify() is True

    monkeypatch.setattr(gigachat_client, "DEFAULT_RU_ROOT", Path(certifi.where()))
    context = gigachat_client._verify()
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.cert_store_stats()["x509_ca"] > 0


def test_deploy_downloads_russian_root_certificate():
    script = (Path(__file__).resolve().parents[2] / "deploy.sh").read_text(encoding="utf-8")
    assert "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt" in script
    assert 'grep -q "Russian Trusted Root CA"' in script
    assert "$BACKEND_DIR/certs/russian_trusted_root_ca.pem" in script
    assert str(gigachat_client.DEFAULT_RU_ROOT).endswith("backend/certs/russian_trusted_root_ca.pem")
