"""Правки по итогам тестирования (ноябрь): списки, комментарии, тесты, ассистент."""
from __future__ import annotations

from types import SimpleNamespace

from sqlalchemy import select

from app.models.book import Book
from app.models.book_comment import BookComment
from app.models.library import MyListEntry, MyListStatus, ReadingProgress
from app.models.user import UserRole
from app.services import quizzes
from app.services import reading_progress as rp
from tests.conftest import auth_headers, make_user
from tests.test_reading_progress import _backdate, _put_progress


async def _book(db, pages: int = 200) -> Book:
    book = Book(title="Книга", author="Автор", description="", total_pages=pages)
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


async def test_book_finished_at_99_percent_moves_to_completed(client, db, approved_user):
    book = await _book(db, 300)
    book_id, user_id = book.id, approved_user.id
    page, last = 1, 297  # 99 % от 300
    while page < last:
        page = min(page + rp.MAX_PAGES_CREDITED_PER_UPDATE, last)
        r = await _put_progress(client, approved_user, book_id, page)
        await _backdate(db, user_id, book_id, 30)
    r = await _put_progress(client, approved_user, book_id, last)
    assert r.status_code == 200
    assert r.json()["finished_at"] is not None
    entry = await db.scalar(select(MyListEntry).where(
        MyListEntry.user_id == user_id, MyListEntry.book_id == book_id))
    assert entry.status == MyListStatus.COMPLETED


async def test_fast_flip_to_end_moves_list_but_gives_no_xp(client, db, approved_user):
    """Пролистал до конца быстро — опыта нет, но книга в «Прочитано», и если
    вернуть её в «Читаю», повторное сохранение той же страницы её не трогает."""
    book = await _book(db, 300)
    book_id, user_id = book.id, approved_user.id
    db.add(MyListEntry(user_id=user_id, book_id=book_id, status=MyListStatus.READING))
    await db.commit()
    xp_before = approved_user.xp or 0
    await _put_progress(client, approved_user, book_id, 5)
    r = await _put_progress(client, approved_user, book_id, 300)
    body = r.json()
    assert body["finished_at"] is None
    assert body["list_status"] == "completed"
    entry = await db.scalar(select(MyListEntry).where(
        MyListEntry.user_id == user_id, MyListEntry.book_id == book_id))
    await db.refresh(entry)
    assert entry.status == MyListStatus.COMPLETED

    entry.status = MyListStatus.READING
    await db.commit()
    r = await _put_progress(client, approved_user, book_id, 300)
    assert r.json()["list_status"] == "reading"
    await db.refresh(approved_user)
    assert (approved_user.xp or 0) - xp_before < rp.XP_FOR_FINISHING_BOOK


async def test_98_percent_is_not_finished(client, db, approved_user):
    book = await _book(db, 300)
    book_id, user_id = book.id, approved_user.id
    page = 1
    while page < 294:
        page = min(page + rp.MAX_PAGES_CREDITED_PER_UPDATE, 294)
        await _put_progress(client, approved_user, book_id, page)
        await _backdate(db, user_id, book_id, 30)
    r = await _put_progress(client, approved_user, book_id, 294)
    assert r.json()["finished_at"] is None


async def test_reading_planned_book_moves_it_to_reading(client, db, approved_user):
    book = await _book(db)
    db.add(MyListEntry(user_id=approved_user.id, book_id=book.id, status=MyListStatus.PLANNED))
    await db.commit()
    book_id, user_id = book.id, approved_user.id
    r = await _put_progress(client, approved_user, book_id, 3)
    assert r.status_code == 200
    entry = await db.scalar(select(MyListEntry).where(
        MyListEntry.user_id == user_id, MyListEntry.book_id == book_id))
    await db.refresh(entry)
    assert entry.status == MyListStatus.READING


async def test_author_edits_own_comment_only(client, db):
    author = await make_user(db, username="c_author")
    other = await make_user(db, username="c_other")
    admin = await make_user(db, username="c_admin", role=UserRole.ADMIN)
    book = await _book(db)
    book_id = book.id

    r = await client.post(f"/books/{book_id}/comments", headers=auth_headers(author), json={"text": "Первый"})
    comment_id = r.json()["id"]
    assert r.json()["can_edit"] is True and r.json()["edited"] is False

    listing = (await client.get(f"/books/{book_id}/comments", headers=auth_headers(other))).json()
    assert listing[0]["can_edit"] is False and listing[0]["can_delete"] is False
    admin_view = (await client.get(f"/books/{book_id}/comments", headers=auth_headers(admin))).json()
    assert admin_view[0]["can_edit"] is False and admin_view[0]["can_delete"] is True

    for intruder in (other, admin):
        r = await client.patch(f"/books/{book_id}/comments/{comment_id}",
                               headers=auth_headers(intruder), json={"text": "Чужая правка"})
        assert r.status_code == 403

    r = await client.patch(f"/books/{book_id}/comments/{comment_id}",
                           headers=auth_headers(author), json={"text": "  Исправлено  "})
    assert r.status_code == 200
    assert r.json()["text"] == "Исправлено" and r.json()["edited"] is True
    saved = await db.get(BookComment, comment_id)
    await db.refresh(saved)
    assert saved.updated_at is not None

    r = await client.patch(f"/books/{book_id}/comments/{comment_id}",
                           headers=auth_headers(author), json={"text": "   "})
    assert r.status_code == 422

    r = await client.delete(f"/books/{book_id}/comments/{comment_id}", headers=auth_headers(other))
    assert r.status_code == 403
    r = await client.delete(f"/books/{book_id}/comments/{comment_id}", headers=auth_headers(author))
    assert r.status_code == 204


def _q(options, correct=0):
    return SimpleNamespace(options=options, correct_index=correct, source="ai")


def test_select_questions_limits_longest_correct_answers():
    hinted = [_q(["очень длинный и подробный правильный ответ", "коротко", "кратко", "мало"]) for _ in range(15)]
    plain = [_q(["ответ", "другой вариант", "третий", "четвёртый"]) for _ in range(15)]
    served = quizzes.select_questions(hinted + plain)
    assert len(served) == quizzes.QUIZ_SERVE_COUNT
    longest = sum(quizzes.correct_is_longest(q.options, q.correct_index) for q in served)
    assert longest <= round(quizzes.QUIZ_SERVE_COUNT * 0.25)


def test_select_questions_keeps_minimum_when_pool_is_mostly_hinted():
    hinted = [_q(["очень длинный и подробный правильный ответ", "коротко", "кратко", "мало"]) for _ in range(15)]
    plain = [_q(["ответ", "другой вариант", "третий", "четвёртый"]) for _ in range(3)]
    served = quizzes.select_questions(hinted + plain)
    assert len(served) == 10


def test_giveaway_length_rejected_at_generation():
    reason = quizzes.quality_issue(
        "Что делает межсетевой экран при правиле deny?",
        ["Блокирует пакет и не отправляет ответ отправителю соединения", "Пропускает", "Логирует", "Шифрует"],
        0,
    )
    assert reason == "giveaway_length"


def test_assistant_prompt_restricts_to_library():
    from app.api.assistant import LIBRARY_RULES, _build_system_prompt
    from app.schemas.assistant import ChatRequest

    prompt = _build_system_prompt(ChatRequest(
        messages=[{"role": "user", "content": "что почитать?"}],
        library=[{"title": "Сети для самых маленьких", "author": "А"}],
    ))
    assert "Сети для самых маленьких" in prompt
    assert LIBRARY_RULES in prompt
    assert "ТОЛЬКО книги из списка" in prompt
    assert "без слов «твоей»" in prompt
    # Даже без списка ассистент не придумывает книги.
    bare = _build_system_prompt(ChatRequest(messages=[{"role": "user", "content": "привет"}]))
    assert LIBRARY_RULES in bare


async def test_cover_thumbnail_is_small_and_not_an_orphan(tmp_path, db):
    from io import BytesIO

    from PIL import Image

    from app.core.storage import LocalStorage, cover_thumb_key
    from app.services import books as books_service
    from app.services.storage_integrity import audit_storage

    storage = LocalStorage(tmp_path)
    big = BytesIO()
    Image.new("RGB", (800, 1200), (200, 30, 30)).save(big, format="JPEG")
    key = "covers/test-cover.jpg"

    async def payload():
        yield big.getvalue()

    await storage.save_stream(key, payload(), 10 * 1024 * 1024)
    thumb = await books_service.ensure_cover_thumb(storage, key)
    assert thumb == cover_thumb_key(key)
    data = b"".join([c async for c in await storage.open_stream(thumb)])
    img = Image.open(BytesIO(data))
    assert max(img.size) <= books_service.COVER_THUMB_SIDE
    assert len(data) < len(big.getvalue())
    # Повторный запрос берёт готовую миниатюру.
    assert await books_service.ensure_cover_thumb(storage, key) == thumb

    book = Book(title="С обложкой", author="А", description="", cover_storage_key=key)
    db.add(book)
    await db.commit()
    audit = await audit_storage(db, storage, grace_hours=0)
    assert thumb not in {item.key for item in audit.orphan_objects}
    assert thumb not in audit.missing_keys


async def test_cover_thumbnail_falls_back_to_full_on_broken_image(tmp_path):
    from app.core.storage import LocalStorage
    from app.services import books as books_service

    storage = LocalStorage(tmp_path)

    async def payload():
        yield b"not an image"

    await storage.save_stream("covers/broken.jpg", payload(), 1024)
    assert await books_service.ensure_cover_thumb(storage, "covers/broken.jpg") is None
