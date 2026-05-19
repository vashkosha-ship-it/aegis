"""Achievements endpoints: catalog + user's own."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.achievement import Achievement, UserAchievement
from app.models.user import User
from app.schemas.achievement import AchievementPublic, UserAchievementPublic

router = APIRouter(tags=["achievements"])


@router.get("/me/achievements", response_model=list[UserAchievementPublic])
async def list_my_achievements(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[UserAchievementPublic]:
    """Achievements awarded to the current user."""
    stmt = (
        select(Achievement, UserAchievement.awarded_at)
        .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
        .where(UserAchievement.user_id == current.id)
        .order_by(UserAchievement.awarded_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        UserAchievementPublic(
            code=ach.code,
            name=ach.name,
            description=ach.description,
            icon=ach.icon,
            tier=ach.tier,
            awarded_at=awarded_at,
        )
        for ach, awarded_at in rows
    ]


@router.get("/achievements", response_model=list[AchievementPublic])
async def list_all_achievements(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AchievementPublic]:
    """Catalog of all available achievements (locked + unlocked)."""
    rows = await db.scalars(select(Achievement).order_by(Achievement.id))
    return [AchievementPublic.model_validate(a) for a in rows.all()]
