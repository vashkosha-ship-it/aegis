"""«Самооценка» и «Заметка на полях» выдаются (раньше их не получал никто)."""
import pytest
from sqlalchemy import select

from app.models.achievement import Achievement, UserAchievement
from app.models.book import Book
from tests.conftest import auth_headers

CODES = {"ach_level_test": "Самооценка", "ach_note_1": "Заметка на полях"}


@pytest.fixture
async def catalog(db):
    for code, name in CODES.items():
        if not await db.scalar(select(Achievement).where(Achievement.code == code)):
            db.add(Achievement(code=code, name=name, description="", icon="🥉", tier="bronze"))
    await db.commit()


async def _codes(db, user_id: int) -> set[str]:
    rows = await db.scalars(
        select(Achievement.code)
        .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
        .where(UserAchievement.user_id == user_id)
    )
    return set(rows.all())


@pytest.mark.asyncio
async def test_level_test_awards_self_assessment(client, db, approved_user, catalog):
    from app.api.onboarding import ONBOARDING_QUESTIONS

    answers = {q["id"]: q["correct"] for q in ONBOARDING_QUESTIONS}
    response = await client.post("/me/onboarding/submit", json={"answers": answers},
                                 headers=auth_headers(approved_user))
    assert response.status_code == 200, response.text
    assert "ach_level_test" in await _codes(db, approved_user.id)
    # Повторное прохождение не ломается и не дублирует.
    again = await client.post("/me/onboarding/submit", json={"answers": answers},
                              headers=auth_headers(approved_user))
    assert again.status_code == 200


@pytest.mark.asyncio
async def test_self_assessment_awards_too(client, db, approved_user, catalog):
    from app.api.onboarding import _VALID_SELF_ASSESS_LEVELS

    level = sorted(_VALID_SELF_ASSESS_LEVELS)[0]
    response = await client.post("/me/onboarding/self-assess", json={"level": level},
                                 headers=auth_headers(approved_user))
    assert response.status_code == 200, response.text
    assert "ach_level_test" in await _codes(db, approved_user.id)


@pytest.mark.asyncio
async def test_first_note_awards_note_achievement(client, db, approved_user, catalog):
    book = Book(title="Сети", author="А", pdf_storage_key="books/pdf/n.pdf")
    db.add(book)
    await db.commit()
    response = await client.post(
        f"/books/{book.id}/annotations",
        json={"type": "highlight", "page": 3, "selected_text": "TCP"},
        headers=auth_headers(approved_user),
    )
    assert response.status_code == 201, response.text
    assert "ach_note_1" in await _codes(db, approved_user.id)
