"""Назначенное чтение: руководитель отдела, читатель, администратор."""
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.book import Book
from app.models.library import ReadingProgress
from app.models.user import UserRole
from tests.conftest import auth_headers, make_user


async def _book(db, title="Сети"):
    book = Book(title=title, author="Автор", description="")
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


async def _set_department(db, user, department, managed=None):
    user.department = department
    user.managed_department = managed
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_reader_cannot_manage_team(client, db):
    reader = await _set_department(db, await make_user(db, username="team_reader"), "ЦВВ")
    book = await _book(db)
    h = auth_headers(reader)
    assert (await client.get("/team/overview", headers=h)).status_code == 403
    assert (await client.post("/team/assignments", headers=h, json={"book_id": book.id})).status_code == 403
    # Сменить себе «отдел руководителя» через профиль нельзя.
    patched = await client.patch("/me", headers=h, json={"managed_department": "ЦВВ"})
    assert patched.status_code in (200, 422)
    assert (await client.get("/auth/me", headers=h)).json()["managed_department"] is None


@pytest.mark.asyncio
async def test_admin_makes_manager_and_manager_assigns(client, db):
    admin = await make_user(db, username="team_admin", role=UserRole.ADMIN)
    boss = await _set_department(db, await make_user(db, username="team_boss"), "ЦВВ")
    worker = await _set_department(db, await make_user(db, username="team_worker", full_name="Иван"), "ЦВВ")
    other = await _set_department(db, await make_user(db, username="team_other"), "УЭК")
    book = await _book(db)

    made = await client.put(
        f"/admin/users/{boss.id}/managed-department",
        headers=auth_headers(admin), json={"department": "ЦВВ"},
    )
    assert made.status_code == 200 and made.json()["managed_department"] == "ЦВВ"
    # Обычный пользователь назначать руководителей не может.
    denied = await client.put(
        f"/admin/users/{worker.id}/managed-department",
        headers=auth_headers(boss), json={"department": "ЦВВ"},
    )
    assert denied.status_code == 403

    await db.refresh(boss)
    hb = auth_headers(boss)
    assert (await client.get("/auth/me", headers=hb)).json()["managed_department"] == "ЦВВ"

    due = (date.today() + timedelta(days=14)).isoformat()
    created = await client.post(
        "/team/assignments", headers=hb,
        json={"book_id": book.id, "due_date": due, "note": "  Главы 1–3  "},
    )
    assert created.status_code == 201, created.text
    assignment = created.json()
    assert assignment["department"] == "ЦВВ" and assignment["note"] == "Главы 1–3"
    # Повторно ту же книгу — конфликт; чужому отделу — запрет.
    assert (await client.post("/team/assignments", headers=hb, json={"book_id": book.id})).status_code == 409
    assert (await client.post(
        "/team/assignments", headers=hb, json={"book_id": book.id, "department": "УЭК"},
    )).status_code == 403
    # Срок в прошлом не принимается.
    past = (date.today() - timedelta(days=1)).isoformat()
    book2 = await _book(db, "Крипто")
    assert (await client.post(
        "/team/assignments", headers=hb, json={"book_id": book2.id, "due_date": past},
    )).status_code == 422

    # Читатель отдела видит назначение, читатель другого отдела — нет.
    mine = (await client.get("/team/me/assignments", headers=auth_headers(worker))).json()
    assert [a["book"]["id"] for a in mine] == [book.id]
    assert mine[0]["my_progress"]["status"] == "not_started"
    assert mine[0]["assigned_by"] == boss.full_name
    assert (await client.get("/team/me/assignments", headers=auth_headers(other))).json() == []

    # Прогресс сотрудника виден руководителю.
    db.add(ReadingProgress(user_id=worker.id, book_id=book.id, current_page=50, total_pages=200, started=True))
    await db.commit()
    overview = (await client.get("/team/overview", headers=hb)).json()
    assert overview["department"] == "ЦВВ"
    # В отделе двое: руководитель и сотрудник; сотрудник УЭК сюда не попадает.
    assert sorted(m["id"] for m in overview["members"]) == sorted([boss.id, worker.id])
    assert any(m["name"] == "Иван" for m in overview["members"])
    cell = overview["progress"][str(assignment["id"])][str(worker.id)]
    assert cell == {"status": "reading", "percent": 25}
    summary = overview["assignments"][0]
    assert summary["reading"] == 1 and summary["completed"] == 0

    # Дочитал — «прочитано».
    row = await db.scalar(select(ReadingProgress).where(ReadingProgress.user_id == worker.id))
    row.finished_at = datetime.now(UTC)
    await db.commit()
    overview = (await client.get("/team/overview", headers=hb)).json()
    assert overview["progress"][str(assignment["id"])][str(worker.id)]["status"] == "completed"

    # Руководитель другого отдела не видит и не трогает назначение.
    rival = await _set_department(db, await make_user(db, username="team_rival"), "УЭК", managed="УЭК")
    hr = auth_headers(rival)
    assert (await client.delete(f"/team/assignments/{assignment['id']}", headers=hr)).status_code == 404
    assert (await client.get("/team/overview", headers=hr)).json()["assignments"] == []

    # Изменить срок и снять назначение.
    new_due = (date.today() + timedelta(days=30)).isoformat()
    patched = await client.patch(f"/team/assignments/{assignment['id']}", headers=hb, json={"due_date": new_due})
    assert patched.status_code == 200 and patched.json()["due_date"] == new_due
    assert (await client.delete(f"/team/assignments/{assignment['id']}", headers=hb)).status_code == 204
    assert (await client.get("/team/me/assignments", headers=auth_headers(worker))).json() == []

    # Снятие роли закрывает доступ.
    await client.put(
        f"/admin/users/{boss.id}/managed-department",
        headers=auth_headers(admin), json={"department": None},
    )
    await db.refresh(boss)
    assert (await client.get("/team/overview", headers=auth_headers(boss))).status_code == 403


@pytest.mark.asyncio
async def test_admin_works_with_any_department_and_legacy_required(client, db):
    admin = await make_user(db, username="team_admin2", role=UserRole.ADMIN)
    reader = await _set_department(db, await make_user(db, username="team_reader2"), "УЭК")
    book = await _book(db, "Риски")
    ha = auth_headers(admin)

    # Старая отметка «обязательная для подразделения» становится назначением.
    marked = await client.post(f"/books/{book.id}/required", headers=ha, json={"department": "УЭК"})
    assert marked.status_code == 200
    mine = (await client.get("/team/me/assignments", headers=auth_headers(reader))).json()
    assert [a["book"]["id"] for a in mine] == [book.id]
    legacy = (await client.get("/books/required/mine", headers=auth_headers(reader))).json()
    assert [b["id"] for b in legacy] == [book.id]

    overview = (await client.get("/team/overview?department=УЭК", headers=ha)).json()
    assert overview["department"] == "УЭК" and "УЭК" in overview["departments"]
    assert len(overview["assignments"]) == 1
