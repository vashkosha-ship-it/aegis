"""Справочник подразделений.

* `GET /org/units` — список для формы регистрации и профиля (без входа).
* `/admin/org/units` — администратор создаёт, переименовывает, перемещает и
  удаляет управления и отделы.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.book import Book
from app.models.org_unit import KIND_DEPARTMENT, KIND_DIRECTORATE, KINDS, OrgUnit
from app.models.team import ReadingAssignment
from app.models.user import User
from app.services.admin_audit import log_admin_action

router = APIRouter(prefix="/org", tags=["org"])
admin_router = APIRouter(prefix="/admin/org", tags=["admin"])

KIND_LABEL = {KIND_DIRECTORATE: "Управление", KIND_DEPARTMENT: "Отдел"}


class OrgUnitPublic(BaseModel):
    id: int
    code: str
    name: str | None = None
    kind: str
    parent_id: int | None = None


class OrgManager(BaseModel):
    id: int
    name: str


class OrgUnitAdmin(OrgUnitPublic):
    members: int = 0
    assignments: int = 0
    managers: list[OrgManager] = []


def _clean_code(value: str) -> str:
    value = " ".join((value or "").split())
    if not value:
        raise ValueError("Укажите код подразделения")
    return value


class OrgUnitCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str | None = Field(default=None, max_length=200)
    kind: str = KIND_DEPARTMENT
    parent_id: int | None = None

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _clean_code(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        value = " ".join((value or "").split())
        return value or None

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: str) -> str:
        if value not in KINDS:
            raise ValueError("Тип: управление или отдел")
        return value


class OrgUnitUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, max_length=200)
    kind: str | None = None
    parent_id: int | None = None

    @field_validator("code")
    @classmethod
    def _code(cls, value: str | None) -> str | None:
        return None if value is None else _clean_code(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        value = " ".join((value or "").split())
        return value or None

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: str | None) -> str | None:
        if value is not None and value not in KINDS:
            raise ValueError("Тип: управление или отдел")
        return value


def _public(unit: OrgUnit) -> OrgUnitPublic:
    return OrgUnitPublic(id=unit.id, code=unit.code, name=unit.name, kind=unit.kind, parent_id=unit.parent_id)


async def _ordered_units(db: AsyncSession) -> list[OrgUnit]:
    """Управления и самостоятельные отделы по алфавиту, отделы — под своим управлением."""
    units = list((await db.scalars(select(OrgUnit))).all())
    tops = sorted((u for u in units if not u.parent_id), key=lambda u: u.code.lower())
    ordered: list[OrgUnit] = []
    for top in tops:
        ordered.append(top)
        ordered.extend(sorted((u for u in units if u.parent_id == top.id), key=lambda u: u.code.lower()))
    return ordered


@router.get("/units", response_model=list[OrgUnitPublic])
async def list_units(db: AsyncSession = Depends(get_db)) -> list[OrgUnitPublic]:
    return [_public(u) for u in await _ordered_units(db)]


@admin_router.get("/units", response_model=list[OrgUnitAdmin])
async def admin_list_units(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> list[OrgUnitAdmin]:
    units = await _ordered_units(db)
    members = dict((await db.execute(
        select(User.department, func.count(User.id)).where(User.department.is_not(None)).group_by(User.department)
    )).all())
    assignments = dict((await db.execute(
        select(ReadingAssignment.department, func.count(ReadingAssignment.id)).group_by(ReadingAssignment.department)
    )).all())
    managers: dict[str, list[OrgManager]] = {}
    for user in (await db.scalars(select(User).where(User.managed_department.is_not(None)))).all():
        managers.setdefault(user.managed_department, []).append(
            OrgManager(id=user.id, name=user.full_name or user.username)
        )
    return [
        OrgUnitAdmin(
            **_public(u).model_dump(),
            members=members.get(u.code, 0),
            assignments=assignments.get(u.code, 0),
            managers=managers.get(u.code, []),
        )
        for u in units
    ]


async def _check_code_free(db: AsyncSession, code: str, own_id: int | None = None) -> None:
    query = select(OrgUnit.id).where(func.lower(OrgUnit.code) == code.lower())
    if own_id:
        query = query.where(OrgUnit.id != own_id)
    if await db.scalar(query):
        raise HTTPException(status_code=409, detail=f"Подразделение «{code}» уже есть")


async def _check_parent(db: AsyncSession, parent_id: int | None, kind: str, own_id: int | None = None) -> None:
    if parent_id is None:
        return
    if kind == KIND_DIRECTORATE:
        raise HTTPException(status_code=422, detail="Управление не может входить в другое подразделение")
    if own_id and parent_id == own_id:
        raise HTTPException(status_code=422, detail="Подразделение не может входить само в себя")
    parent = await db.get(OrgUnit, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Управление не найдено")
    if parent.kind != KIND_DIRECTORATE:
        raise HTTPException(status_code=422, detail="Отдел может входить только в управление")


@admin_router.post("/units", response_model=OrgUnitPublic, status_code=status.HTTP_201_CREATED)
async def create_unit(
    request: Request,
    payload: OrgUnitCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> OrgUnitPublic:
    await _check_code_free(db, payload.code)
    await _check_parent(db, payload.parent_id, payload.kind)
    unit = OrgUnit(code=payload.code, name=payload.name, kind=payload.kind, parent_id=payload.parent_id)
    db.add(unit)
    await log_admin_action(
        db, admin, "org_unit_create", request=request, target=f"org:{payload.code}",
        detail=f"{KIND_LABEL[payload.kind]} {payload.code} создано",
    )
    await db.commit()
    await db.refresh(unit)
    return _public(unit)


@admin_router.patch("/units/{unit_id}", response_model=OrgUnitPublic)
async def update_unit(
    request: Request,
    unit_id: int,
    payload: OrgUnitUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> OrgUnitPublic:
    unit = await db.get(OrgUnit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Подразделение не найдено")
    fields = payload.model_fields_set
    old_code = unit.code
    kind = payload.kind if "kind" in fields and payload.kind else unit.kind
    parent_id = payload.parent_id if "parent_id" in fields else unit.parent_id

    if kind == KIND_DEPARTMENT and unit.kind == KIND_DIRECTORATE:
        if await db.scalar(select(OrgUnit.id).where(OrgUnit.parent_id == unit.id).limit(1)):
            raise HTTPException(status_code=422, detail="В управлении есть отделы — сначала перенесите их")
    await _check_parent(db, parent_id, kind, own_id=unit.id)

    if "code" in fields and payload.code and payload.code != old_code:
        await _check_code_free(db, payload.code, own_id=unit.id)
        new_code = payload.code
        # Код — это связь с сотрудниками, руководителями и назначениями.
        await db.execute(update(User).where(User.department == old_code).values(department=new_code))
        await db.execute(update(User).where(User.managed_department == old_code).values(managed_department=new_code))
        await db.execute(update(ReadingAssignment).where(ReadingAssignment.department == old_code).values(department=new_code))
        await db.execute(update(Book).where(Book.required_for_department == old_code).values(required_for_department=new_code))
        unit.code = new_code
    if "name" in fields:
        unit.name = payload.name
    unit.kind = kind
    unit.parent_id = parent_id
    await log_admin_action(
        db, admin, "org_unit_update", request=request, target=f"org:{unit.code}",
        detail=f"Изменено подразделение {old_code}" + (f" → {unit.code}" if unit.code != old_code else ""),
    )
    await db.commit()
    await db.refresh(unit)
    return _public(unit)


@admin_router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    request: Request,
    unit_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> None:
    unit = await db.get(OrgUnit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Подразделение не найдено")
    if await db.scalar(select(OrgUnit.id).where(OrgUnit.parent_id == unit.id).limit(1)):
        raise HTTPException(status_code=409, detail="В управлении есть отделы — сначала перенесите или удалите их")
    members = await db.scalar(select(func.count(User.id)).where(User.department == unit.code)) or 0
    if members:
        raise HTTPException(
            status_code=409,
            detail=f"В подразделении {members} сотрудн. — сначала переведите их в другое подразделение",
        )
    # Руководители теряют роль, назначения подразделению снимаются.
    await db.execute(update(User).where(User.managed_department == unit.code).values(managed_department=None))
    await db.execute(update(Book).where(Book.required_for_department == unit.code).values(required_for_department=None))
    for assignment in (await db.scalars(select(ReadingAssignment).where(ReadingAssignment.department == unit.code))).all():
        await db.delete(assignment)
    await log_admin_action(
        db, admin, "org_unit_delete", request=request, target=f"org:{unit.code}",
        detail=f"{KIND_LABEL.get(unit.kind, 'Подразделение')} {unit.code} удалено",
    )
    await db.delete(unit)
    await db.commit()
