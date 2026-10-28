"""Структура подразделений: кто в какое подразделение входит и кто чем управляет."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.org_unit import KIND_DIRECTORATE, OrgUnit
from app.models.user import User, UserRole


@dataclass
class OrgTree:
    units: list[OrgUnit]

    def __post_init__(self) -> None:
        self.by_code = {u.code: u for u in self.units}
        self.by_id = {u.id: u for u in self.units}

    def get(self, code: str | None) -> OrgUnit | None:
        return self.by_code.get(code) if code else None

    def is_directorate(self, code: str | None) -> bool:
        unit = self.get(code)
        return bool(unit and unit.kind == KIND_DIRECTORATE)

    def children(self, code: str) -> list[OrgUnit]:
        unit = self.get(code)
        if not unit:
            return []
        return [u for u in self.units if u.parent_id == unit.id]

    def subtree(self, code: str) -> set[str]:
        """Подразделение и, для управления, все его отделы."""
        return {code, *(c.code for c in self.children(code))}

    def parent_code(self, code: str | None) -> str | None:
        unit = self.get(code)
        if unit and unit.parent_id:
            parent = self.by_id.get(unit.parent_id)
            return parent.code if parent else None
        return None

    def lineage(self, code: str | None) -> list[str]:
        """Подразделение сотрудника и его управление: чьи назначения его касаются."""
        if not code:
            return []
        parent = self.parent_code(code)
        return [code, parent] if parent else [code]

    def manageable(self, user: User) -> list[str]:
        """Коды, с которыми пользователь работает как руководитель (по порядку)."""
        if user.role == UserRole.ADMIN:
            tops = sorted((u for u in self.units if not u.parent_id), key=lambda u: u.code.lower())
            ordered: list[str] = []
            for top in tops:
                ordered.append(top.code)
                ordered.extend(sorted((c.code for c in self.children(top.code)), key=str.lower))
            return ordered
        code = user.managed_department
        if not code:
            return []
        return [code, *sorted((c.code for c in self.children(code)), key=str.lower)]


async def load_tree(db: AsyncSession) -> OrgTree:
    return OrgTree(list((await db.scalars(select(OrgUnit))).all()))


async def is_known_unit(db: AsyncSession, code: str) -> bool:
    """Есть ли такое подразделение. Пустой справочник принимает любое значение."""
    if await db.scalar(select(OrgUnit.id).where(OrgUnit.code == code)):
        return True
    return not await db.scalar(select(OrgUnit.id).limit(1))
