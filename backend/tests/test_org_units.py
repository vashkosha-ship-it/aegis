"""Справочник подразделений: управления, отделы и права начальника управления."""
from datetime import date, timedelta

import pytest

from app.models.book import Book
from app.models.user import UserRole
from tests.conftest import auth_headers, make_user


async def _book(db, title):
    book = Book(title=title, author="Автор", description="")
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


async def _place(db, user, department=None, managed=None):
    user.department = department
    user.managed_department = managed
    await db.commit()
    await db.refresh(user)
    return user


async def _make_structure(client, admin):
    ha = auth_headers(admin)
    uek = (await client.post("/admin/org/units", headers=ha, json={"code": "УЭК", "kind": "directorate", "name": "Управление экспертизы"})).json()
    otd1 = (await client.post("/admin/org/units", headers=ha, json={"code": "ОЭ-1", "parent_id": uek["id"]})).json()
    otd2 = (await client.post("/admin/org/units", headers=ha, json={"code": "ОЭ-2", "parent_id": uek["id"]})).json()
    solo = (await client.post("/admin/org/units", headers=ha, json={"code": "ЦВВ"})).json()
    return uek, otd1, otd2, solo


@pytest.mark.asyncio
async def test_admin_builds_structure_with_rules(client, db):
    admin = await make_user(db, username="org_admin", role=UserRole.ADMIN)
    reader = await make_user(db, username="org_reader")
    ha = auth_headers(admin)
    uek, otd1, otd2, solo = await _make_structure(client, admin)
    assert otd1["parent_id"] == uek["id"] and solo["parent_id"] is None

    # Справочник открыт без входа — нужен форме регистрации; порядок: управление, его отделы.
    public = (await client.get("/org/units")).json()
    assert [u["code"] for u in public] == ["УЭК", "ОЭ-1", "ОЭ-2", "ЦВВ"]

    # Только администратор меняет структуру.
    assert (await client.post("/admin/org/units", headers=auth_headers(reader), json={"code": "X"})).status_code == 403
    # Код уникален без учёта регистра; управление не вкладывается; отдел — только в управление.
    assert (await client.post("/admin/org/units", headers=ha, json={"code": "цвв"})).status_code == 409
    assert (await client.post("/admin/org/units", headers=ha, json={"code": "У2", "kind": "directorate", "parent_id": uek["id"]})).status_code == 422
    assert (await client.post("/admin/org/units", headers=ha, json={"code": "О3", "parent_id": solo["id"]})).status_code == 422
    # Управление с отделами нельзя сделать отделом и удалить.
    assert (await client.patch(f"/admin/org/units/{uek['id']}", headers=ha, json={"kind": "department"})).status_code == 422
    assert (await client.delete(f"/admin/org/units/{uek['id']}", headers=ha)).status_code == 409

    # Самостоятельный отдел переносим в управление.
    moved = await client.patch(f"/admin/org/units/{solo['id']}", headers=ha, json={"parent_id": uek["id"]})
    assert moved.status_code == 200 and moved.json()["parent_id"] == uek["id"]
    await client.patch(f"/admin/org/units/{solo['id']}", headers=ha, json={"parent_id": None})

    # Переименование кода переносит сотрудников, руководителей и назначения.
    await _place(db, reader, "ОЭ-1")
    boss = await _place(db, await make_user(db, username="org_boss1"), "ОЭ-1", managed="ОЭ-1")
    book = await _book(db, "Сети")
    assert (await client.post("/team/assignments", headers=auth_headers(boss), json={"book_id": book.id})).status_code == 201
    renamed = await client.patch(f"/admin/org/units/{otd1['id']}", headers=ha, json={"code": "ОЭК-1", "name": "Отдел экспертизы 1"})
    assert renamed.json()["code"] == "ОЭК-1"
    await db.refresh(reader)
    await db.refresh(boss)
    assert reader.department == "ОЭК-1" and boss.managed_department == "ОЭК-1"
    mine = (await client.get("/team/me/assignments", headers=auth_headers(reader))).json()
    assert mine[0]["department"] == "ОЭК-1"

    # Список для админа: сотрудники, назначения, руководители.
    listing = {u["code"]: u for u in (await client.get("/admin/org/units", headers=ha)).json()}
    assert listing["ОЭК-1"]["members"] == 2 and listing["ОЭК-1"]["assignments"] == 1
    assert [m["name"] for m in listing["ОЭК-1"]["managers"]] == [boss.full_name]

    # Подразделение с сотрудниками не удаляется; после перевода — удаляется,
    # руководитель теряет роль, назначения снимаются.
    assert (await client.delete(f"/admin/org/units/{otd1['id']}", headers=ha)).status_code == 409
    for user in (reader, boss):
        moved = await client.put(f"/admin/users/{user.id}/department", headers=ha, json={"department": "ОЭ-2"})
        assert moved.status_code == 200
    assert (await client.delete(f"/admin/org/units/{otd1['id']}", headers=ha)).status_code == 204
    await db.refresh(boss)
    assert boss.managed_department is None
    assert (await client.get("/team/me/assignments", headers=auth_headers(reader))).json() == []


@pytest.mark.asyncio
async def test_department_must_come_from_directory(client, db):
    admin = await make_user(db, username="org_admin2", role=UserRole.ADMIN)
    reader = await make_user(db, username="org_reader2")
    await _make_structure(client, admin)
    h = auth_headers(reader)
    assert (await client.patch("/me", headers=h, json={"department": "Выдуманный"})).status_code == 422
    assert (await client.patch("/me", headers=h, json={"department": "ОЭ-2"})).status_code == 200
    # Руководить можно только существующим подразделением.
    bad = await client.put(f"/admin/users/{reader.id}/managed-department", headers=auth_headers(admin), json={"department": "Нет такого"})
    assert bad.status_code == 404


@pytest.mark.asyncio
async def test_directorate_head_sees_all_departments(client, db):
    admin = await make_user(db, username="org_admin3", role=UserRole.ADMIN)
    await _make_structure(client, admin)
    head = await _place(db, await make_user(db, username="org_head", full_name="Начальник"), "УЭК", managed="УЭК")
    a = await _place(db, await make_user(db, username="org_a", full_name="Аня"), "ОЭ-1")
    b = await _place(db, await make_user(db, username="org_b", full_name="Боря"), "ОЭ-2")
    c = await _place(db, await make_user(db, username="org_c", full_name="Вера"), "ЦВВ")
    dept_boss = await _place(db, await make_user(db, username="org_dboss"), "ОЭ-1", managed="ОЭ-1")
    book1 = await _book(db, "Для всего управления")
    book2 = await _book(db, "Для отдела 2")
    hh = auth_headers(head)

    # Начальник управления видит управление и все его отделы, но не чужие.
    overview = (await client.get("/team/overview", headers=hh)).json()
    assert overview["department"] == "УЭК" and overview["department_kind"] == "directorate"
    assert overview["departments"] == ["УЭК", "ОЭ-1", "ОЭ-2"]
    # Сам начальник управления в команду не входит, руководитель отдела — входит.
    assert {m["id"] for m in overview["members"]} == {a.id, b.id, dept_boss.id}
    assert c.id not in {m["id"] for m in overview["members"]}
    assert (await client.get("/team/overview?department=ЦВВ", headers=hh)).status_code == 403

    due = (date.today() + timedelta(days=7)).isoformat()
    whole = await client.post("/team/assignments", headers=hh, json={"book_id": book1.id, "due_date": due})
    assert whole.status_code == 201 and whole.json()["department"] == "УЭК"
    one = await client.post("/team/assignments", headers=hh, json={"book_id": book2.id, "department": "ОЭ-2"})
    assert one.status_code == 201

    # Сотрудник отдела видит назначение своего отдела и своего управления.
    assert sorted(x["book"]["id"] for x in (await client.get("/team/me/assignments", headers=auth_headers(b))).json()) == sorted([book1.id, book2.id])
    assert [x["book"]["id"] for x in (await client.get("/team/me/assignments", headers=auth_headers(a))).json()] == [book1.id]
    assert (await client.get("/team/me/assignments", headers=auth_headers(c))).json() == []
    # Начальнику управления его назначения не приходят; руководителю отдела
    # назначение управления приходит — он подчинённый начальника управления.
    assert (await client.get("/team/me/assignments", headers=hh)).json() == []
    assert [x["book"]["id"] for x in (await client.get("/team/me/assignments", headers=auth_headers(dept_boss))).json()] == [book1.id]
    whole_view = [x for x in (await client.get("/team/overview", headers=hh)).json()["assignments"] if x["book"]["id"] == book1.id][0]
    assert whole_view["audience"] == 3

    # Руководитель отдела видит назначение управления, но изменить его не может.
    hd = auth_headers(dept_boss)
    dept_view = (await client.get("/team/overview", headers=hd)).json()
    assert dept_view["departments"] == ["ОЭ-1"] and dept_view["parent_code"] == "УЭК"
    # В команде отдела — сотрудники без самого руководителя.
    assert [m["id"] for m in dept_view["members"]] == [a.id]
    inherited = [x for x in dept_view["assignments"] if x["book"]["id"] == book1.id][0]
    assert inherited["inherited"] is True and inherited["editable"] is False
    assert (await client.delete(f"/team/assignments/{inherited['id']}", headers=hd)).status_code == 404
    assert (await client.get("/team/overview?department=УЭК", headers=hd)).status_code == 403

    # Администратор без выбора не попадает ни в какой отдел — выбирает сам.
    admin_view = (await client.get("/team/overview", headers=auth_headers(admin))).json()
    assert admin_view["department"] == "" and admin_view["members"] == []
    assert "ОЭ-1" in admin_view["departments"]
    assert [u["code"] for u in admin_view["units"]][:4] == ["УЭК", "ОЭ-1", "ОЭ-2", "ЦВВ"]


@pytest.mark.asyncio
async def test_directorate_view_includes_department_books_for_their_people_only(client, db):
    admin = await make_user(db, username="org_admin4", role=UserRole.ADMIN)
    await _make_structure(client, admin)
    head = await _place(db, await make_user(db, username="org_head4"), "УЭК", managed="УЭК")
    a = await _place(db, await make_user(db, username="org_a4"), "ОЭ-1")
    b = await _place(db, await make_user(db, username="org_b4"), "ОЭ-2")
    book = await _book(db, "Только для ОЭ-2")
    hh = auth_headers(head)
    await client.post("/team/assignments", headers=hh, json={"book_id": book.id, "department": "ОЭ-2"})

    view = (await client.get("/team/overview", headers=hh)).json()
    item = view["assignments"][0]
    assert item["department"] == "ОЭ-2" and item["inherited"] is False and item["editable"] is True
    # Прогресс — только среди сотрудников ОЭ-2, остальные не «не начали».
    assert item["audience"] == 1 and item["not_started"] == 1
    assert set(view["progress"][str(item["id"])]) == {str(b.id)}
    members = {m["id"]: m for m in view["members"]}
    assert members[a.id]["not_started"] == 0 and members[b.id]["not_started"] == 1
