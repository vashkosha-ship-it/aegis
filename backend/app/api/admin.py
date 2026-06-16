"""Admin endpoints: dashboard stats, user management, leaderboard, book analytics."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.library import MyListEntry, MyListStatus, ReadingProgress, Review
from app.models.quiz import QuizAttempt
from app.models.user import User, UserRole

router = APIRouter(prefix="/admin", tags=["admin"])


class DashboardStats(BaseModel):
    total_books: int
    total_users: int
    total_reviews: int
    total_quiz_attempts: int
    total_views: int
    total_downloads: int


class LeaderboardEntry(BaseModel):
    username: str
    full_name: str | None
    xp: int
    streak_count: int


class AdminUserView(BaseModel):
    id: int
    username: str
    email: str | None
    role: UserRole
    full_name: str | None = None
    department: str | None = None
    xp: int
    streak_count: int = 0
    cyber_level: str | None = None
    is_active: bool
    created_at: str | None = None
    # Статистика
    completed_books: int = 0
    quiz_attempts: int = 0
    perfect_quizzes: int = 0
    total_pages_read: int = 0


# ============================================================================
# Schemas: book analytics
# ============================================================================


class BookReaderRow(BaseModel):
    """Запись в таблице «кто читает» в детальной аналитике книги."""
    user_id: int
    username: str
    full_name: str | None
    current_page: int
    total_pages: int
    progress_pct: int
    started: bool
    last_read_at: str | None  # ISO


class MyListBreakdown(BaseModel):
    reading: int
    planned: int
    dropped: int
    completed: int
    liked: int
    total: int


class BookAnalytics(BaseModel):
    # Базовая
    book_id: int
    title: str
    author: str
    categories: list[str]
    rating: float
    views: int
    downloads: int
    reviews_count: int
    has_file: bool

    # MyList
    mylist: MyListBreakdown

    # Прогресс читателей
    readers_started: int          # сколько начали (started=true)
    readers_completed: int        # сколько с current_page == total_pages
    avg_progress_pct: int         # средний % по всем started-юзерам
    readers: list[BookReaderRow]  # детальный список

    # Тесты по книге
    quiz_attempts: int            # всего попыток
    quiz_passed: int              # прошедшие (≥60%)
    quiz_avg_percentage: int      # средний % по всем попыткам


# ============================================================================
# Endpoints: уже существующие
# ============================================================================


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> DashboardStats:
    """Aggregate counters for the admin home screen."""
    total_books = (await db.scalar(select(func.count(Book.id)))) or 0
    total_users = (await db.scalar(select(func.count(User.id)))) or 0
    total_reviews = (await db.scalar(select(func.count(Review.id)))) or 0
    total_attempts = (await db.scalar(select(func.count(QuizAttempt.id)))) or 0
    total_views = (await db.scalar(select(func.coalesce(func.sum(Book.views), 0)))) or 0
    total_downloads = (await db.scalar(select(func.coalesce(func.sum(Book.downloads), 0)))) or 0

    return DashboardStats(
        total_books=total_books,
        total_users=total_users,
        total_reviews=total_reviews,
        total_quiz_attempts=total_attempts,
        total_views=total_views,
        total_downloads=total_downloads,
    )


@router.get("/users", response_model=list[AdminUserView])
async def list_all_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> list[AdminUserView]:
    """List all users with computed stats (admin only)."""
    users = (await db.scalars(select(User).order_by(User.created_at.desc()))).all()

    # Группа MyList completed
    completed_rows = (await db.execute(
        select(MyListEntry.user_id, func.count(MyListEntry.id))
        .where(MyListEntry.status == MyListStatus.COMPLETED)
        .group_by(MyListEntry.user_id)
    )).all()
    completed_map = {row[0]: row[1] for row in completed_rows}

    # Тесты — всего и идеальных (100%)
    attempts_rows = (await db.execute(
        select(QuizAttempt.user_id, func.count(QuizAttempt.id))
        .group_by(QuizAttempt.user_id)
    )).all()
    attempts_map = {row[0]: row[1] for row in attempts_rows}

    perfect_rows = (await db.execute(
        select(QuizAttempt.user_id, func.count(QuizAttempt.id))
        .where(QuizAttempt.percentage >= 100)
        .group_by(QuizAttempt.user_id)
    )).all()
    perfect_map = {row[0]: row[1] for row in perfect_rows}

    # Сумма страниц прочитанных (по reading_progress)
    pages_rows = (await db.execute(
        select(ReadingProgress.user_id, func.sum(ReadingProgress.current_page))
        .where(ReadingProgress.started.is_(True))
        .group_by(ReadingProgress.user_id)
    )).all()
    pages_map = {row[0]: int(row[1] or 0) for row in pages_rows}

    result = []
    for u in users:
        result.append(AdminUserView(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            full_name=u.full_name,
            department=u.department,
            xp=u.xp,
            streak_count=u.streak_count or 0,
            cyber_level=u.cyber_level,
            is_active=u.is_active,
            created_at=u.created_at.isoformat() if u.created_at else None,
            completed_books=completed_map.get(u.id, 0),
            quiz_attempts=attempts_map.get(u.id, 0),
            perfect_quizzes=perfect_map.get(u.id, 0),
            total_pages_read=pages_map.get(u.id, 0),
        ))
    return result


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_admin),
) -> None:
    """Delete a user. Cannot delete self or other admins."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot delete admin accounts")
    await db.delete(user)
    await db.commit()


class PendingUserView(BaseModel):
    id: int
    username: str
    email: str | None
    full_name: str | None
    department: str | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/users/pending", response_model=list[PendingUserView])
async def list_pending_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> list[PendingUserView]:
    """Список пользователей, подтвердивших email, но ещё не одобренных админом."""
    rows = await db.scalars(
        select(User)
        .where(and_(User.is_verified == True, User.is_approved == False))  # noqa: E712
        .order_by(User.created_at.asc())
    )
    return [PendingUserView.model_validate(u) for u in rows.all()]


@router.post("/users/{user_id}/approve", status_code=status.HTTP_200_OK)
async def approve_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> dict:
    """Одобрить аккаунт — пользователь получает доступ к библиотеке."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_approved = True
    await db.commit()
    return {"detail": "approved", "user_id": user_id}


@router.post("/users/{user_id}/reject", status_code=status.HTTP_200_OK)
async def reject_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_admin),
) -> dict:
    """Отклонить заявку — удалить неодобренный аккаунт."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot reject admin accounts")
    if user.is_approved:
        raise HTTPException(status_code=400, detail="User already approved")
    await db.delete(user)
    await db.commit()
    return {"detail": "rejected", "user_id": user_id}
async def leaderboard(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LeaderboardEntry]:
    """Top users by XP."""
    rows = await db.scalars(
        select(User).where(User.is_active.is_(True)).order_by(User.xp.desc()).limit(limit)
    )
    return [
        LeaderboardEntry(
            username=u.username,
            full_name=u.full_name,
            xp=u.xp,
            streak_count=u.streak_count,
        )
        for u in rows.all()
    ]


# ============================================================================
# Endpoint: детальная аналитика книги
# ============================================================================


@router.get("/books/{book_id}/analytics", response_model=BookAnalytics)
async def book_analytics(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> BookAnalytics:
    """Полная статистика по конкретной книге для админа.

    Включает:
    - базовые поля (рейтинг, просмотры, число отзывов)
    - разбивку по MyList по статусам
    - прогресс чтения: сколько начали, завершили, средний %
    - список читателей с их прогрессом
    - статистику попыток теста
    """
   # 1. Базовая инфа из самой книги (с подгрузкой категорий)
    from sqlalchemy.orm import selectinload
    book = (await db.execute(
        select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
    )).scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    reviews_count = (
        await db.scalar(select(func.count(Review.id)).where(Review.book_id == book_id))
    ) or 0

    # 2. MyList — группируем по статусу
    mylist_rows = await db.execute(
        select(MyListEntry.status, func.count(MyListEntry.id))
        .where(MyListEntry.book_id == book_id)
        .group_by(MyListEntry.status)
    )
    mylist_counts = {row[0]: row[1] for row in mylist_rows.all()}
    mylist = MyListBreakdown(
        reading=mylist_counts.get(MyListStatus.READING, 0),
        planned=mylist_counts.get(MyListStatus.PLANNED, 0),
        dropped=mylist_counts.get(MyListStatus.DROPPED, 0),
        completed=mylist_counts.get(MyListStatus.COMPLETED, 0),
        liked=mylist_counts.get(MyListStatus.LIKED, 0),
        total=sum(mylist_counts.values()),
    )

    # 3. Прогресс читателей — берём всех с записью в reading_progress
    progress_rows = (
        await db.execute(
            select(ReadingProgress, User)
            .join(User, User.id == ReadingProgress.user_id)
            .where(ReadingProgress.book_id == book_id)
            .order_by(ReadingProgress.last_read_at.desc())
        )
    ).all()

    readers_list: list[BookReaderRow] = []
    started_count = 0
    completed_count = 0
    progress_sum = 0
    progress_count = 0

    for progress, user in progress_rows:
        pct = 0
        if progress.total_pages > 0:
            pct = min(100, round(progress.current_page / progress.total_pages * 100))

        if progress.started:
            started_count += 1
            progress_sum += pct
            progress_count += 1
            # Завершил — если на последней странице (или близко к ней)
            if progress.current_page >= progress.total_pages and progress.total_pages > 0:
                completed_count += 1

        readers_list.append(BookReaderRow(
            user_id=user.id,
            username=user.username,
            full_name=user.full_name,
            current_page=progress.current_page,
            total_pages=progress.total_pages,
            progress_pct=pct,
            started=progress.started,
            last_read_at=progress.last_read_at.isoformat() if progress.last_read_at else None,
        ))

    avg_progress = round(progress_sum / progress_count) if progress_count > 0 else 0

    # 4. Тесты по этой книге
    attempts_total = (
        await db.scalar(
            select(func.count(QuizAttempt.id)).where(QuizAttempt.book_id == book_id)
        )
    ) or 0

    # «Прошёл» = percentage ≥ 60. У QuizAttempt должно быть поле percentage
    # (если нет — считаем как score/total*100; на всякий случай используем coalesce)
    attempts_passed = (
        await db.scalar(
            select(func.count(QuizAttempt.id))
            .where(and_(QuizAttempt.book_id == book_id, QuizAttempt.percentage >= 60))
        )
    ) or 0

    avg_percentage_raw = await db.scalar(
        select(func.avg(QuizAttempt.percentage)).where(QuizAttempt.book_id == book_id)
    )
    avg_percentage = round(avg_percentage_raw) if avg_percentage_raw is not None else 0

    return BookAnalytics(
        book_id=book.id,
        title=book.title,
        author=book.author,
        categories=[c.name for c in book.categories],
        rating=float(book.rating) if book.rating is not None else 0.0,
        views=book.views or 0,
        downloads=book.downloads or 0,
        reviews_count=reviews_count,
        has_file=bool(getattr(book, "pdf_key", None) or getattr(book, "epub_key", None)),
        mylist=mylist,
        readers_started=started_count,
        readers_completed=completed_count,
        avg_progress_pct=avg_progress,
        readers=readers_list,
        quiz_attempts=attempts_total,
        quiz_passed=attempts_passed,
        quiz_avg_percentage=avg_percentage,
    )