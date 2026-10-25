"""Аватары из готового набора вместо загрузки своих фото."""
from pathlib import Path

import pytest

from app.core.avatars import AVATAR_DIR, AVATAR_PRESETS
from tests.conftest import auth_headers, make_user

FRONTEND_AVATARS = Path(__file__).resolve().parents[2] / "frontend" / "avatars"


def test_fifteen_presets_exist_and_match_frontend_copies():
    assert len(AVATAR_PRESETS) == 15
    for preset in AVATAR_PRESETS:
        source = AVATAR_DIR / f"{preset}.svg"
        assert source.is_file(), preset
        text = source.read_text(encoding="utf-8")
        assert "<script" not in text.lower() and "href" not in text.lower()
        # Картинки в окне выбора (фронтенд) — те же файлы.
        assert (FRONTEND_AVATARS / f"{preset}.svg").read_bytes() == source.read_bytes()


@pytest.mark.asyncio
async def test_choose_preset_then_letter(client, db):
    user = await make_user(db, username="avatar_user")
    headers = auth_headers(user)

    chosen = await client.patch("/me", headers=headers, json={"avatar_preset": "a07"})
    assert chosen.status_code == 200
    assert chosen.json()["has_avatar"] is True
    assert chosen.json()["avatar_preset"] == "a07"

    image = await client.get(f"/users/{user.id}/avatar", headers=headers)
    assert image.status_code == 200
    assert image.headers["content-type"].startswith("image/svg+xml")
    assert b"<svg" in image.content

    cleared = await client.delete("/me/avatar", headers=headers)
    assert cleared.status_code == 200
    assert cleared.json()["has_avatar"] is False
    assert (await client.get(f"/users/{user.id}/avatar", headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_unknown_preset_and_upload_are_rejected(client, db):
    user = await make_user(db, username="avatar_upload")
    headers = auth_headers(user)
    assert (await client.patch("/me", headers=headers, json={"avatar_preset": "a99"})).status_code == 422
    upload = await client.post(
        "/me/avatar", headers=headers,
        files={"file": ("me.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")},
    )
    assert upload.status_code in (404, 405)
