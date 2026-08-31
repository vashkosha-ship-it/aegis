"""XP не должен теряться при параллельных начислениях.

`user.xp += amount` в Python — это чтение и запись двумя шагами. Начисления
приходят из разных мест: за открытие книги, за дочитывание, за тест, за отзыв,
за стрик. Стоит двум совпасть по времени — оба читают одно значение,
прибавляют каждый своё и записывают. Одна прибавка исчезает, причём молча: ни
в логе, ни в данных следа не остаётся, а пользователь видит, что XP «не
начислился».

Гонку внутри сдачи теста мы закрыли блокировкой пользователя, но начисления
из чтения и достижений шли мимо неё.
"""
from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.achievement import Achievement, UserAchievement
from app.models.user import User
from app.services.gamification import (
    add_xp,
    check_and_award_achievements,
    update_streak,
)


@pytest_asyncio.fixture
async def session_factory(engine):
    """Отдельная сессия на каждую параллельную операцию.

    С общей сессией все «параллельные» вызовы попадают в одну транзакцию, и
    гонка не воспроизводится — тест проходит, а прод ломается.
    """
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def _xp_of(db, user_id: int) -> int:
    return await db.scalar(select(User.xp).where(User.id == user_id))


class TestConcurrentXp:
    @pytest.mark.parametrize("workers", [2, 10])
    async def test_parallel_awards_are_all_counted(
        self, db, approved_user, session_factory, workers
    ):
        user_id = approved_user.id
        before = await _xp_of(db, user_id)

        async def award(amount: int) -> None:
            async with session_factory() as session:
                user = await session.get(User, user_id)
                await add_xp(session, user, amount)
                await session.commit()

        await asyncio.gather(*[award(10) for _ in range(workers)])

        after = await _xp_of(db, user_id)
        assert after - before == 10 * workers, (
            f"начислено {after - before} вместо {10 * workers} — прибавки потеряны"
        )

    async def test_different_amounts_all_land(
        self, db, approved_user, session_factory
    ):
        """Разные суммы — как в жизни: 10 за открытие, 25 за дочитывание, 15 за тест."""
        user_id = approved_user.id
        before = await _xp_of(db, user_id)
        amounts = [10, 25, 15, 30, 5]

        async def award(amount: int) -> None:
            async with session_factory() as session:
                user = await session.get(User, user_id)
                await add_xp(session, user, amount)
                await session.commit()

        await asyncio.gather(*[award(a) for a in amounts])

        after = await _xp_of(db, user_id)
        assert after - before == sum(amounts)


class TestAddXpBehaviour:
    async def test_object_sees_new_value_immediately(self, db, approved_user):
        """Пороговые достижения смотрят на user.xp сразу после начисления."""
        before = approved_user.xp
        await add_xp(db, approved_user, 40)

        assert approved_user.xp == before + 40, (
            "объект в сессии не увидел начисление — достижения по порогам "
            "будут срабатывать с опозданием"
        )

    async def test_value_survives_commit(self, db, approved_user):
        """Раньше объект в сессии мог записать старое значение поверх нового."""
        user_id = approved_user.id
        before = approved_user.xp

        await add_xp(db, approved_user, 40)
        await db.commit()

        assert await _xp_of(db, user_id) == before + 40

    async def test_zero_is_noop(self, db, approved_user):
        before = approved_user.xp
        await add_xp(db, approved_user, 0)
        assert approved_user.xp == before

    async def test_negative_amount_subtracts(self, db, approved_user):
        """Списание тоже должно быть атомарным, если понадобится."""
        before = approved_user.xp
        await add_xp(db, approved_user, -5)
        assert approved_user.xp == before - 5


class TestStreak:
    async def test_first_mark_starts_streak(self, db, approved_user):
        approved_user.streak_count = 0
        approved_user.streak_last_date = None
        await db.commit()

        await update_streak(db, approved_user)
        await db.commit()

        assert approved_user.streak_count == 1

    async def test_second_mark_same_day_does_nothing(self, db, approved_user):
        await update_streak(db, approved_user)
        await db.commit()
        first = approved_user.streak_count
        xp_after_first = approved_user.xp

        await update_streak(db, approved_user)
        await db.commit()

        assert approved_user.streak_count == first, "стрик прибавился дважды за день"
        assert approved_user.xp == xp_after_first, "бонус за стрик выдан дважды"

    async def test_parallel_marks_count_once(
        self, db, approved_user, session_factory
    ):
        """Две вкладки открыли книгу одновременно — стрик один.

        Без блокировки оба запроса видели last_date = вчера и оба прибавляли.
        """
        user_id = approved_user.id
        approved_user.streak_count = 0
        approved_user.streak_last_date = None
        await db.commit()

        async def mark() -> None:
            async with session_factory() as session:
                user = await session.get(User, user_id)
                await update_streak(session, user)
                await session.commit()

        await asyncio.gather(mark(), mark(), return_exceptions=True)

        streak = await db.scalar(
            select(User.streak_count).where(User.id == user_id)
        )
        assert streak == 1, f"стрик засчитан {streak} раз вместо одного"


class TestAchievementRace:
    """Две награды одновременно не должны ронять транзакцию вызывающего.

    Уникальный индекс uq_user_achievement не даёт создать дубль — но прежняя
    вставка через db.add() падала бы с IntegrityError на коммите. Коммит
    делает вызывающий код, поэтому откатывалась вся его транзакция:
    пользователь терял сданный тест из-за того, что достижение выдали дважды.
    """

    @pytest_asyncio.fixture
    async def seeded_achievement(self, db):
        code = "ach_reading_1"
        existing = await db.scalar(
            select(Achievement).where(Achievement.code == code)
        )
        if existing is None:
            db.add(Achievement(
                code=code, name="Первая книга", description="", icon="🥉",
                tier="bronze",
            ))
            await db.commit()
        return code

    async def _granted_count(self, db, user_id: int, code: str) -> int:
        return await db.scalar(
            select(func.count(UserAchievement.id))
            .join(Achievement, Achievement.id == UserAchievement.achievement_id)
            .where(UserAchievement.user_id == user_id, Achievement.code == code)
        )

    async def test_parallel_award_does_not_raise(
        self, db, approved_user, session_factory, seeded_achievement
    ):
        user_id = approved_user.id

        async def award() -> list[str]:
            async with session_factory() as session:
                user = await session.get(User, user_id)
                codes = await check_and_award_achievements(
                    session, user, trigger="reading_started"
                )
                await session.commit()
                return codes

        results = await asyncio.gather(award(), award(), return_exceptions=True)

        errors = [r for r in results if isinstance(r, Exception)]
        assert not errors, f"параллельная выдача уронила транзакцию: {errors}"

    async def test_achievement_granted_exactly_once(
        self, db, approved_user, session_factory, seeded_achievement
    ):
        user_id = approved_user.id

        async def award() -> list[str]:
            async with session_factory() as session:
                user = await session.get(User, user_id)
                codes = await check_and_award_achievements(
                    session, user, trigger="reading_started"
                )
                await session.commit()
                return codes

        await asyncio.gather(*[award() for _ in range(5)], return_exceptions=True)

        count = await self._granted_count(db, user_id, seeded_achievement)
        assert count == 1, f"достижение выдано {count} раз"

    async def test_only_the_winner_reports_the_code(
        self, db, approved_user, session_factory, seeded_achievement
    ):
        """Проигравший гонку не должен сообщать о награде, которую выдал не он.

        Иначе фронт покажет уведомление дважды.
        """
        user_id = approved_user.id

        async def award() -> list[str]:
            async with session_factory() as session:
                user = await session.get(User, user_id)
                codes = await check_and_award_achievements(
                    session, user, trigger="reading_started"
                )
                await session.commit()
                return codes

        results = await asyncio.gather(award(), award(), return_exceptions=True)
        reported = [
            r for r in results
            if not isinstance(r, Exception) and seeded_achievement in r
        ]
        assert len(reported) == 1, (
            f"о награде сообщили {len(reported)} раз — уведомление задвоится"
        )

    async def test_repeat_call_reports_nothing_new(
        self, db, approved_user, seeded_achievement
    ):
        first = await check_and_award_achievements(
            db, approved_user, trigger="reading_started"
        )
        await db.commit()
        assert seeded_achievement in first

        second = await check_and_award_achievements(
            db, approved_user, trigger="reading_started"
        )
        await db.commit()
        assert seeded_achievement not in second
