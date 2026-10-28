"""Отдел: назначенное чтение.

* Читатель видит книги, назначенные его подразделению, со сроком и своим
  прогрессом (`GET /team/me/assignments`).
* Руководитель отдела (`users.managed_department`, выдаёт администратор)
  назначает книги своему отделу и видит, кто из сотрудников их читает.
  Начальник управления — то же для всего управления и для каждого его отдела.
  Назначение управлению касается всех сотрудников его отделов.
* Администратор может то же самое для любого подразделения и назначает
  руководителей (`PUT /admin/users/{id}/managed-department`, в admin.py).
  Структура подразделений — app/api/org.py.

Руководитель видит только прогресс по назначенным книгам — не всё, что
сотрудник читает, и не его заметки.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.library import MyListEntry, MyListStatus, ReadingProgress
from app.models.team import ReadingAssignment
from app.models.user import User, UserRole
from app.services.admin_audit import log_admin_action
from app.services.org import OrgTree, load_tree

router = APIRouter(prefix="/team", tags=["team"])

NOTE_MAX = 500


# ---------------------------------------------------------------------------
# Схемы
# ---------------------------------------------------------------------------


class AssignmentBook(BaseModel):
    id: int
    title: str
    author: str
    has_cover: bool = False


class MemberProgress(BaseModel):
    status: str  # not_started | reading | completed
    percent: int = 0


class AssignmentView(BaseModel):
    id: int
    department: str
    # Назначено управлением, в которое входит отдел (видно на экране отдела).
    inherited: bool = False
    # Может ли текущий пользователь изменить или снять назначение.
    editable: bool = True
    # Скольким сотрудникам на экране назначение адресовано (управлению — всем,
    # отделу — только его сотрудникам).
    audience: int = 0
    book: AssignmentBook
    due_date: date | None = None
    note: str | None = None
    assigned_by: str | None = None
    overdue: bool = False
    # Для читателя — его собственный прогресс.
    my_progress: MemberProgress | None = None
    # Для руководителя — сводка по отделу.
    completed: int = 0
    reading: int = 0
    not_started: int = 0


class TeamMember(BaseModel):
    id: int
    name: str
    department: str | None = None
    avatar_preset: str | None = None
    completed: int = 0
    reading: int = 0
    not_started: int = 0
    overdue: int = 0


class TeamUnit(BaseModel):
    code: str
    name: str | None = None
    kind: str = "department"
    parent_code: str | None = None


class TeamOverview(BaseModel):
    department: str
    department_name: str | None = None
    department_kind: str = "department"
    parent_code: str | None = None
    departments: list[str] = []  # из каких подразделений можно выбрать
    units: list[TeamUnit] = []
    members: list[TeamMember]
    assignments: list[AssignmentView]
    # progress[assignment_id][member_id]
    progress: dict[int, dict[int, MemberProgress]]


def _clean_note(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class AssignmentCreate(BaseModel):
    book_id: int = Field(gt=0)
    due_date: date | None = None
    note: str | None = Field(default=None, max_length=NOTE_MAX)
    department: str | None = Field(default=None, max_length=64)  # только для администратора

    @field_validator("note")
    @classmethod
    def _strip_note(cls, value: str | None) -> str | None:
        return _clean_note(value)


class AssignmentUpdate(BaseModel):
    due_date: date | None = None
    note: str | None = Field(default=None, max_length=NOTE_MAX)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, value: str | None) -> str | None:
        return _clean_note(value)


# ---------------------------------------------------------------------------
# Права
# ---------------------------------------------------------------------------


def _is_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN


async def _manageable(db: AsyncSession, user: User) -> tuple[OrgTree, list[str]]:
    """Справочник и коды подразделений, которыми пользователь может управлять."""
    tree = await load_tree(db)
    codes = tree.manageable(user)
    if _is_admin(user):
        # Подразделения из старых данных, которых ещё нет в справочнике.
        extra = sorted(set(await _known_departments(db)) - set(codes), key=str.lower)
        codes = [*codes, *extra]
    elif user.managed_department and not codes:
        codes = [user.managed_department]
    return tree, codes


def _require_manager(user: User) -> None:
    if not _is_admin(user) and not user.managed_department:
        raise HTTPException(status_code=403, detail="Доступно только руководителю подразделения")


async def _pick_department(
    db: AsyncSession, user: User, requested: str | None
) -> tuple[OrgTree, list[str], str | None]:
    """Подразделение, с которым работает руководитель. Администратору без
    выбора — None: подразделение он выбирает сам, «своего» у него нет."""
    _require_manager(user)
    tree, codes = await _manageable(db, user)
    requested = (requested or "").strip() or None
    if requested:
        if requested not in codes:
            if _is_admin(user):
                raise HTTPException(status_code=404, detail="Подразделение не найдено")
            raise HTTPException(status_code=403, detail="Можно управлять только своим подразделением")
        return tree, codes, requested
    if _is_admin(user):
        return tree, codes, None
    return tree, codes, codes[0]


async def _get_assignment_for_manager(
    db: AsyncSession, assignment_id: int, user: User
) -> ReadingAssignment:
    assignment = await db.get(ReadingAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Назначение не найдено")
    _tree, codes = await _manageable(db, user)
    if assignment.department not in codes:
        # Чужое назначение — не раскрываем, что оно существует.
        raise HTTPException(status_code=404, detail="Назначение не найдено")
    return assignment


# ---------------------------------------------------------------------------
# Прогресс
# ---------------------------------------------------------------------------


async def _progress_map(
    db: AsyncSession, user_ids: list[int], book_ids: list[int]
) -> dict[tuple[int, int], MemberProgress]:
    """(user_id, book_id) → прогресс. Нет записи — «не начинал»."""
    result: dict[tuple[int, int], MemberProgress] = {}
    if not user_ids or not book_ids:
        return result
    rows = (await db.scalars(
        select(ReadingProgress).where(
            ReadingProgress.user_id.in_(user_ids), ReadingProgress.book_id.in_(book_ids)
        )
    )).all()
    for row in rows:
        total = max(row.total_pages or 1, 1)
        percent = max(0, min(100, round((row.current_page or 0) * 100 / total)))
        if row.finished_at is not None:
            result[(row.user_id, row.book_id)] = MemberProgress(status="completed", percent=100)
        elif row.started:
            result[(row.user_id, row.book_id)] = MemberProgress(status="reading", percent=percent)
    done = (await db.execute(
        select(MyListEntry.user_id, MyListEntry.book_id).where(
            MyListEntry.user_id.in_(user_ids),
            MyListEntry.book_id.in_(book_ids),
            MyListEntry.status == MyListStatus.COMPLETED,
        )
    )).all()
    for user_id, book_id in done:
        result[(user_id, book_id)] = MemberProgress(status="completed", percent=100)
    return result


def _is_overdue(assignment: ReadingAssignment, progress: MemberProgress | None) -> bool:
    if not assignment.due_date or assignment.due_date >= date.today():
        return False
    return not progress or progress.status != "completed"


def _view(assignment: ReadingAssignment) -> AssignmentView:
    book = assignment.book
    author = assignment.assigned_by
    return AssignmentView(
        id=assignment.id,
        department=assignment.department,
        book=AssignmentBook(
            id=book.id, title=book.title, author=book.author or "",
            has_cover=bool(book.cover_storage_key),
        ),
        due_date=assignment.due_date,
        note=assignment.note,
        assigned_by=(author.full_name or author.username) if author else None,
    )


async def _assignments(db: AsyncSession, departments: list[str]) -> list[ReadingAssignment]:
    if not departments:
        return []
    return list((await db.scalars(
        select(ReadingAssignment)
        .where(ReadingAssignment.department.in_(departments))
        .order_by(ReadingAssignment.due_date.is_(None), ReadingAssignment.due_date,
                  ReadingAssignment.created_at.desc())
    )).unique().all())


# ---------------------------------------------------------------------------
# Читатель
# ---------------------------------------------------------------------------


@router.get("/me/assignments", response_model=list[AssignmentView])
async def my_assignments(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[AssignmentView]:
    """Книги, назначенные подразделению текущего пользователя."""
    if not current.department:
        return []
    tree = await load_tree(db)
    # Назначения своего отдела и управления, в которое он входит.
    assignments = await _assignments(db, tree.lineage(current.department))
    progress = await _progress_map(db, [current.id], [a.book_id for a in assignments])
    views = []
    for assignment in assignments:
        mine = progress.get((current.id, assignment.book_id)) or MemberProgress(status="not_started")
        view = _view(assignment)
        view.my_progress = mine
        view.overdue = _is_overdue(assignment, mine)
        views.append(view)
    return views


# ---------------------------------------------------------------------------
# Руководитель
# ---------------------------------------------------------------------------


async def _known_departments(db: AsyncSession) -> list[str]:
    from_users = (await db.scalars(
        select(User.department).where(User.department.is_not(None)).distinct()
    )).all()
    from_assignments = (await db.scalars(select(ReadingAssignment.department).distinct())).all()
    return sorted({d for d in [*from_users, *from_assignments] if d and d.strip()})


def _unit_list(tree: OrgTree, codes: list[str]) -> list[TeamUnit]:
    result = []
    for code in codes:
        unit = tree.get(code)
        result.append(TeamUnit(
            code=code,
            name=unit.name if unit else None,
            kind=unit.kind if unit else "department",
            parent_code=tree.parent_code(code),
        ))
    return result


@router.get("/overview", response_model=TeamOverview)
async def team_overview(
    department: str | None = Query(default=None, max_length=64),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> TeamOverview:
    tree, codes, dept = await _pick_department(db, current, department)
    units = _unit_list(tree, codes)
    if dept is None:
        return TeamOverview(department="", departments=codes, units=units, members=[], assignments=[], progress={})

    unit = tree.get(dept)
    # Управление — все сотрудники его отделов; отдел — его сотрудники.
    member_codes = tree.subtree(dept) if tree.is_directorate(dept) else {dept}
    members = list((await db.scalars(
        select(User)
        .where(User.department.in_(member_codes), User.is_active.is_(True), User.is_approved.is_(True))
        .order_by(User.full_name.nulls_last(), User.username)
    )).all())
    # На экране отдела видны и назначения его управления: они касаются тех же
    # людей. На экране управления — и назначения его отделов.
    shown = set(tree.lineage(dept)) | set(member_codes)
    assignments = await _assignments(db, sorted(shown))
    member_ids = [m.id for m in members]
    progress = await _progress_map(db, member_ids, [a.book_id for a in assignments])

    member_views = {
        m.id: TeamMember(
            id=m.id, name=m.full_name or m.username, department=m.department, avatar_preset=m.avatar_preset,
        )
        for m in members
    }
    matrix: dict[int, dict[int, MemberProgress]] = {}
    views = []
    for assignment in assignments:
        view = _view(assignment)
        view.inherited = assignment.department == tree.parent_code(dept)
        view.editable = assignment.department in codes
        # Назначение отделу касается только его сотрудников, управлению — всех.
        audience_codes = (
            tree.subtree(assignment.department) if tree.is_directorate(assignment.department)
            else {assignment.department}
        )
        audience = [m.id for m in members if m.department in audience_codes]
        view.audience = len(audience)
        row: dict[int, MemberProgress] = {}
        for member_id in audience:
            item = progress.get((member_id, assignment.book_id)) or MemberProgress(status="not_started")
            row[member_id] = item
            setattr(view, item.status, getattr(view, item.status) + 1)
            member = member_views[member_id]
            setattr(member, item.status, getattr(member, item.status) + 1)
            if _is_overdue(assignment, item):
                member.overdue += 1
        view.overdue = any(_is_overdue(assignment, item) for item in row.values())
        matrix[assignment.id] = row
        views.append(view)

    return TeamOverview(
        department=dept,
        department_name=unit.name if unit else None,
        department_kind=unit.kind if unit else "department",
        parent_code=tree.parent_code(dept),
        departments=codes,
        units=units,
        members=list(member_views.values()),
        assignments=views,
        progress=matrix,
    )


@router.post("/assignments", response_model=AssignmentView, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    request: Request,
    payload: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> AssignmentView:
    _tree, _codes, dept = await _pick_department(db, current, payload.department)
    if not dept:
        raise HTTPException(status_code=422, detail="Выберите подразделение")
    book = await db.get(Book, payload.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Книга не найдена")
    if payload.due_date and payload.due_date < date.today():
        raise HTTPException(status_code=422, detail="Срок не может быть в прошлом")
    existing = await db.scalar(
        select(ReadingAssignment).where(
            ReadingAssignment.department == dept, ReadingAssignment.book_id == book.id
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Эта книга уже назначена этому подразделению")
    assignment = ReadingAssignment(
        department=dept, book_id=book.id, assigned_by_id=current.id,
        due_date=payload.due_date, note=payload.note,
    )
    db.add(assignment)
    await log_admin_action(
        db, current, "team_assignment_create", request=request,
        target=f"book:{book.id}", detail=f"Подразделению {dept} назначена книга «{book.title}»",
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Эта книга уже назначена этому подразделению") from None
    await db.refresh(assignment)
    return _view(assignment)


@router.patch("/assignments/{assignment_id}", response_model=AssignmentView)
async def update_assignment(
    request: Request,
    assignment_id: int,
    payload: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> AssignmentView:
    _require_manager(current)
    assignment = await _get_assignment_for_manager(db, assignment_id, current)
    fields = payload.model_fields_set
    if "due_date" in fields:
        if payload.due_date and payload.due_date < date.today() and payload.due_date != assignment.due_date:
            raise HTTPException(status_code=422, detail="Срок не может быть в прошлом")
        assignment.due_date = payload.due_date
    if "note" in fields:
        assignment.note = payload.note
    await log_admin_action(
        db, current, "team_assignment_update", request=request,
        target=f"assignment:{assignment.id}", detail=f"Изменено назначение для {assignment.department}",
    )
    await db.commit()
    await db.refresh(assignment)
    return _view(assignment)


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    request: Request,
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    _require_manager(current)
    assignment = await _get_assignment_for_manager(db, assignment_id, current)
    await log_admin_action(
        db, current, "team_assignment_delete", request=request,
        target=f"book:{assignment.book_id}", detail=f"Снято назначение для {assignment.department}",
    )
    await db.delete(assignment)
    await db.commit()
