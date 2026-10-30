"""Смена пароля без потери заметок и временный пароль от администратора."""
import pytest
from sqlalchemy import select

from app.models.book import Book
from app.models.library import Annotation, AnnotationType
from app.models.user import UserRole
from tests.conftest import auth_headers, make_user

ENC = "enc:v1:"


async def _book(db):
    book = Book(title="Сети", author="Автор", description="")
    db.add(book)
    await db.commit()
    return book


@pytest.mark.asyncio
async def test_password_change_reencrypts_own_notes_atomically(client, db):
    user = await make_user(db, username="pw_user", password="OldPass123!")
    other = await make_user(db, username="pw_other")
    book = await _book(db)
    mine = Annotation(user_id=user.id, book_id=book.id, type=AnnotationType.NOTE, page=1,
                      selected_text=ENC + "old-a", note_text=ENC + "old-b", position={})
    plain = Annotation(user_id=user.id, book_id=book.id, type=AnnotationType.HIGHLIGHT, page=2,
                       selected_text="старый открытый текст", position={})
    foreign = Annotation(user_id=other.id, book_id=book.id, type=AnnotationType.HIGHLIGHT, page=1,
                         selected_text=ENC + "foreign", position={})
    db.add_all([mine, plain, foreign])
    await db.commit()
    ids = {"mine": mine.id, "foreign": foreign.id}
    h = auth_headers(user)

    listed = (await client.get("/me/annotations/encrypted", headers=h)).json()
    assert [a["id"] for a in listed] == [ids["mine"]]

    # Открытый текст вместо шифротекста не принимается, пароль не меняется.
    bad = await client.post("/me/password", headers=h, json={
        "current_password": "OldPass123!", "new_password": "NewPass456!",
        "reencrypted_annotations": [{"id": ids["mine"], "selected_text": "открыто", "note_text": None}],
    })
    assert bad.status_code == 400

    ok = await client.post("/me/password", headers=h, json={
        "current_password": "OldPass123!", "new_password": "NewPass456!",
        "reencrypted_annotations": [
            {"id": ids["mine"], "selected_text": ENC + "new-a", "note_text": ENC + "new-b"},
            # Чужую заметку так не переписать.
            {"id": ids["foreign"], "selected_text": ENC + "hijack", "note_text": None},
        ],
    })
    assert ok.status_code == 204
    db.expire_all()
    rows = {a.id: a for a in (await db.scalars(select(Annotation))).all()}
    assert (rows[ids["mine"]].selected_text, rows[ids["mine"]].note_text) == (ENC + "new-a", ENC + "new-b")
    assert rows[ids["foreign"]].selected_text == ENC + "foreign"
    # Старые токены отозваны, новый пароль работает.
    assert (await client.get("/auth/me", headers=h)).status_code == 401
    login = await client.post("/auth/login", json={"username": "pw_user", "password": "NewPass456!"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_admin_sets_temporary_password_and_user_must_change_it(client, db):
    admin = await make_user(db, username="pw_admin", role=UserRole.ADMIN)
    user = await make_user(db, username="pw_forgot", password="Forgotten1!")
    user_id = user.id
    ha = auth_headers(admin)

    # Слабый пароль и свой аккаунт — нельзя; не админ — нельзя.
    assert (await client.post(f"/admin/users/{user_id}/password", headers=ha, json={"password": "short"})).status_code == 422
    assert (await client.post(f"/admin/users/{admin.id}/password", headers=ha, json={"password": "Temp12345!"})).status_code == 400
    assert (await client.post(f"/admin/users/{user_id}/password", headers=auth_headers(user),
                              json={"password": "Temp12345!"})).status_code == 403

    old_headers = auth_headers(user)
    reset = await client.post(f"/admin/users/{user_id}/password", headers=ha, json={"password": "Temp12345!"})
    assert reset.status_code == 204
    # Все прежние сессии пользователя отозваны.
    assert (await client.get("/auth/me", headers=old_headers)).status_code == 401

    login = await client.post("/auth/login", json={"username": "pw_forgot", "password": "Temp12345!"})
    assert login.status_code == 200
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = (await client.get("/auth/me", headers=h)).json()
    assert me["must_change_password"] is True
    # До смены пароля библиотека закрыта.
    blocked = await client.get("/books", headers=h)
    assert blocked.status_code == 403 and blocked.json()["detail"] == "Password change required"

    changed = await client.post("/me/password", headers=h, json={
        "current_password": "Temp12345!", "new_password": "MyOwnPass9!",
    })
    assert changed.status_code == 204
    login = await client.post("/auth/login", json={"username": "pw_forgot", "password": "MyOwnPass9!"})
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/auth/me", headers=h)).json()["must_change_password"] is False
    assert (await client.get("/books", headers=h)).status_code == 200

    from app.models.admin_log import AdminLog
    log = await db.scalar(select(AdminLog).where(AdminLog.action == "user_password_reset"))
    assert log is not None and "Temp12345" not in (log.detail or "")


@pytest.mark.asyncio
async def test_password_help_request_without_email(client, db):
    from app.models.password_help import PasswordHelpRequest

    admin = await make_user(db, username="help_admin", role=UserRole.ADMIN)
    user = await make_user(db, username="no_mail_user", email=None)
    user_id = user.id
    ha = auth_headers(admin)

    known = await client.post("/auth/password-help", json={"username": "No_Mail_User", "contact": "Telegram @nomail"})
    unknown = await client.post("/auth/password-help", json={"username": "nobody_here", "contact": "внутр. 1234"})
    # Ответ одинаковый — по нему не узнать, есть ли такой логин.
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    # Повторная заявка не плодит записи, а обновляет контакт.
    await client.post("/auth/password-help", json={"username": "no_mail_user", "contact": "тел. 5-55"})

    listed = (await client.get("/admin/password-help", headers=ha)).json()
    by_login = {item["username"].lower(): item for item in listed}
    assert set(by_login) == {"no_mail_user", "nobody_here"}
    assert by_login["no_mail_user"]["user_id"] == user_id
    assert by_login["no_mail_user"]["contact"] == "тел. 5-55"
    assert by_login["nobody_here"]["user_id"] is None
    # Не администратору заявки не видны.
    assert (await client.get("/admin/password-help", headers=auth_headers(user))).status_code in (401, 403)

    # Сброс пароля закрывает заявку пользователя; чужую — закрывают вручную.
    assert (await client.post(f"/admin/users/{user_id}/password", headers=ha, json={"password": "Temp12345!"})).status_code == 204
    left = (await client.get("/admin/password-help", headers=ha)).json()
    assert [item["username"] for item in left] == ["nobody_here"]
    assert (await client.post(f"/admin/password-help/{left[0]['id']}/close", headers=ha)).status_code == 204
    assert (await client.get("/admin/password-help", headers=ha)).json() == []
    assert (await db.scalar(select(PasswordHelpRequest).where(PasswordHelpRequest.resolved_at.is_(None)))) is None


@pytest.mark.asyncio
async def test_admin_reviews_in_one_request(client, db):
    from app.models.library import Review

    admin = await make_user(db, username="rev_admin", role=UserRole.ADMIN)
    reader = await make_user(db, username="rev_reader")
    book = await _book(db)
    db.add(Review(user_id=reader.id, book_id=book.id, rating=5, text="Отлично"))
    await db.commit()

    rows = (await client.get("/admin/reviews", headers=auth_headers(admin))).json()
    assert [(r["book_title"], r["user_username"], r["rating"]) for r in rows] == [("Сети", "rev_reader", 5)]
    assert (await client.get("/admin/reviews", headers=auth_headers(reader))).status_code == 403
