"""Library endpoints: reading progress, mylist, reviews, annotations, heatmap."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.library import (
    Annotation,
    DailyPagesRead,
    MyListEntry,
    ReadingProgress,
    Review,
)
from app.models.user import User
from app.schemas.library import (
    AnnotationCreate,
    AnnotationPublic,
    HeatmapEntry,
    HeatmapResponse,
    MyListEntryPublic,
    MyListUpdate,
    ReadingProgressPublic,
    ReadingProgressUpdate,
    ReviewCreate,
    ReviewPublic,
)
from app.services.gamification import (
    add_xp,
    check_and_award_achievements,
    update_streak,
)

router = APIRouter(tags=["library"])


# ---------- Reading Progress ----------

@router.put(
    "/books/{book_id}/progress",
    response_model=ReadingProgressPublic,
)
async def update_progress(
    book_id: int,
    payload: ReadingProgressUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ReadingProgressPublic:
    """Update or create reading progress for a book. Awards XP on first start."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    progress = await db.scalar(
        select(ReadingProgress).where(
            ReadingProgress.user_id == current.id,
            ReadingProgress.book_id == book_id,
        )
    )
    is_first_start = False
    if not progress:
        progress = ReadingProgress(
            user_id=current.id,
            book_id=book_id,
            current_page=payload.current_page,
            total_pages=payload.total_pages or book.total_pages or 1,
            started=True,
        )
        db.add(progress)
        is_first_start = True
    else:
        previous_page = progress.current_page
        progress.current_page = payload.current_page
        if payload.total_pages:
            progress.total_pages = payload.total_pages
        if not progress.started:
            progress.started = True
            is_first_start = True
        # инкремент daily_pages если страница увеличилась
        delta = max(0, payload.current_page - previous_page)
        if delta > 0:
            today = datetime.now(timezone.utc).date()
            daily = await db.scalar(
                select(DailyPagesRead).where(
                    DailyPagesRead.user_id == current.id,
                    DailyPagesRead.date == today,
                )
            )
            if not daily:
                daily = DailyPagesRead(user_id=current.id, date=today, pages=delta)
                db.add(daily)
            else:
                daily.pages += delta

    if is_first_start:
        await add_xp(db, current, 10)
        await update_streak(db, current)
        await check_and_award_achievements(db, current, trigger="reading_started")

    await db.commit()
    await db.refresh(progress)
    return ReadingProgressPublic.model_validate(progress)


@router.get("/me/progress", response_model=list[ReadingProgressPublic])
async def list_my_progress(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[ReadingProgressPublic]:
    """All reading progress entries for the current user."""
    rows = await db.scalars(
        select(ReadingProgress).where(ReadingProgress.user_id == current.id)
    )
    return [ReadingProgressPublic.model_validate(r) for r in rows.all()]


# ---------- MyList ----------

@router.put("/books/{book_id}/mylist", response_model=MyListEntryPublic)
async def set_mylist_status(
    book_id: int,
    payload: MyListUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> MyListEntryPublic:
    """Set the user's MyList status for a book."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    entry = await db.scalar(
        select(MyListEntry).where(
            MyListEntry.user_id == current.id,
            MyListEntry.book_id == book_id,
        )
    )
    if entry:
        entry.status = payload.status
    else:
        entry = MyListEntry(user_id=current.id, book_id=book_id, status=payload.status)
        db.add(entry)

    await db.commit()
    await db.refresh(entry)
    return MyListEntryPublic.model_validate(entry)


@router.delete("/books/{book_id}/mylist", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_mylist(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    """Remove book from user's MyList."""
    entry = await db.scalar(
        select(MyListEntry).where(
            MyListEntry.user_id == current.id,
            MyListEntry.book_id == book_id,
        )
    )
    if entry:
        await db.delete(entry)
        await db.commit()


@router.get("/me/mylist", response_model=list[MyListEntryPublic])
async def get_my_mylist(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[MyListEntryPublic]:
    """All MyList entries for the current user."""
    rows = await db.scalars(select(MyListEntry).where(MyListEntry.user_id == current.id))
    return [MyListEntryPublic.model_validate(r) for r in rows.all()]


# ---------- Reviews ----------

async def _recalculate_book_rating(db: AsyncSession, book_id: int) -> None:
    """Update Book.rating to current avg of all reviews."""
    avg = await db.scalar(select(func.avg(Review.rating)).where(Review.book_id == book_id))
    book = await db.get(Book, book_id)
    if book:
        book.rating = Decimal(f"{float(avg):.2f}") if avg is not None else Decimal("0.00")


@router.post(
    "/books/{book_id}/reviews",
    response_model=ReviewPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_review(
    book_id: int,
    payload: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ReviewPublic:
    """Add a review. One review per user per book — second call updates the existing one."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    existing = await db.scalar(
        select(Review).where(Review.user_id == current.id, Review.book_id == book_id)
    )
    if existing:
        existing.rating = payload.rating
        existing.text = payload.text
        review = existing
    else:
        review = Review(
            user_id=current.id, book_id=book_id, rating=payload.rating, text=payload.text
        )
        db.add(review)
        await add_xp(db, current, 10)
        await check_and_award_achievements(db, current, trigger="review_added")

    await db.flush()
    await _recalculate_book_rating(db, book_id)
    await db.commit()
    await db.refresh(review)

    return ReviewPublic(
        id=review.id,
        user_id=review.user_id,
        user_username=current.username,
        rating=review.rating,
        text=review.text,
        created_at=review.created_at,
    )


@router.get("/books/{book_id}/reviews", response_model=list[ReviewPublic])
async def list_reviews(
    book_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[ReviewPublic]:
    """All reviews for a book."""
    stmt = (
        select(Review, User.username)
        .join(User, User.id == Review.user_id)
        .where(Review.book_id == book_id)
        .order_by(Review.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        ReviewPublic(
            id=r.id,
            user_id=r.user_id,
            user_username=username,
            rating=r.rating,
            text=r.text,
            created_at=r.created_at,
        )
        for r, username in rows
    ]


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    """User deletes own review, or admin deletes any."""
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current.id and current.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    book_id = review.book_id
    await db.delete(review)
    await db.flush()
    await _recalculate_book_rating(db, book_id)
    await db.commit()


# ---------- Annotations ----------

@router.post(
    "/books/{book_id}/annotations",
    response_model=AnnotationPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_annotation(
    book_id: int,
    payload: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> AnnotationPublic:
    """Create a highlight or note. Awards XP."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    ann = Annotation(
        user_id=current.id,
        book_id=book_id,
        type=payload.type,
        page=payload.page,
        selected_text=payload.selected_text,
        note_text=payload.note_text,
        position=payload.position,
    )
    db.add(ann)
    await add_xp(db, current, 5 if payload.type.value == "note" else 2)
    await db.commit()
    await db.refresh(ann)
    return AnnotationPublic.model_validate(ann)


@router.get("/books/{book_id}/annotations", response_model=list[AnnotationPublic])
async def list_annotations(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[AnnotationPublic]:
    """All current user's annotations for a book."""
    rows = await db.scalars(
        select(Annotation)
        .where(Annotation.user_id == current.id, Annotation.book_id == book_id)
        .order_by(Annotation.page, Annotation.created_at)
    )
    return [AnnotationPublic.model_validate(a) for a in rows.all()]


@router.delete("/annotations/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    """Delete own annotation."""
    ann = await db.get(Annotation, annotation_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if ann.user_id != current.id and current.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.delete(ann)
    await db.commit()


# ---------- Heatmap ----------

@router.get("/me/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    days: int = 90,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> HeatmapResponse:
    """Return reading activity for the last N days (default 90)."""
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days)
    rows = await db.scalars(
        select(DailyPagesRead)
        .where(
            DailyPagesRead.user_id == current.id,
            DailyPagesRead.date >= start,
        )
        .order_by(DailyPagesRead.date)
    )
    by_date = {r.date.isoformat(): r.pages for r in rows.all()}

    entries: list[HeatmapEntry] = []
    for offset in range(days, -1, -1):
        d = today - timedelta(days=offset)
        entries.append(HeatmapEntry(date=d.isoformat(), pages=by_date.get(d.isoformat(), 0)))
    return HeatmapResponse(days=entries)
