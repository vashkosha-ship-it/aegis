"""Регрессионный тест: захват аккаунта через /auth/verify.

Дыра: эндпоинт выдавал токены подтверждённому пользователю НЕ проверяя код.
Любой, кто знал чужой email, получал полный доступ к аккаунту без пароля.
"""
from __future__ import annotations

from tests.conftest import make_user


class TestVerifyTakeover:
    async def test_verified_account_cannot_be_taken_over(self, client, db):
        """Главный тест: чужой email + произвольный код не должны дать токены."""
        victim = await make_user(db, username="victim2", is_verified=True)

        r = await client.post(
            "/auth/verify",
            json={"email": victim.email, "code": "000000"},
        )

        assert r.status_code != 200, "Подтверждённый аккаунт захватывается без пароля"
        assert "access_token" not in r.text

    async def test_verified_account_rejects_any_code(self, client, db):
        """Перебор кодов тоже не должен срабатывать."""
        victim = await make_user(db, username="victim3", is_verified=True)

        for code in ("111111", "123456", "999999"):
            r = await client.post(
                "/auth/verify", json={"email": victim.email, "code": code}
            )
            assert r.status_code != 200
