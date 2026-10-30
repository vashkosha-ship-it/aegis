"""Одна и та же книга не должна попадать в библиотеку дважды."""
import hashlib

import pytest

from app.core.storage import get_storage
from app.main import app
from app.models.book import Book
from app.services import books as books_service
from tests.conftest import auth_headers
from tests.test_privacy_epub_indexing import MemoryStorage

PDF = b"%PDF-1.7\n%%EOF"


@pytest.fixture
def storage(monkeypatch):
    memory = MemoryStorage()
    app.dependency_overrides[get_storage] = lambda: memory

    class Job:
        job_id = "job"

    class Queue:
        async def enqueue_job(self, name, book_id):
            return Job()

    async def get_queue():
        return Queue()

    monkeypatch.setattr("app.core.queue.get_queue", get_queue)
    yield memory
    app.dependency_overrides.pop(get_storage, None)


async def _upload(client, admin_user, book_id, content=PDF):
    return await client.post(
        f"/books/{book_id}/pdf",
        files={"file": ("book.pdf", content, "application/pdf")},
        headers=auth_headers(admin_user),
    )


@pytest.mark.asyncio
async def test_second_upload_of_same_file_is_rejected(client, db, admin_user, storage):
    first = Book(title="Оригинал", author="А", description="")
    second = Book(title="Копия", author="Б", description="")
    db.add_all([first, second])
    await db.commit()

    assert (await _upload(client, admin_user, first.id)).status_code == 200
    await db.refresh(first)
    assert first.file_sha256 == hashlib.sha256(PDF).hexdigest()
    files_before = set(storage.files)

    response = await _upload(client, admin_user, second.id)

    assert response.status_code == 409
    assert "Оригинал" in response.json()["detail"]
    assert response.headers["X-Duplicate-Of"] == str(first.id)
    # Файл копии не остался в хранилище, у второй книги файла нет.
    assert set(storage.files) == files_before
    await db.refresh(second)
    assert second.pdf_storage_key is None and second.file_sha256 is None


@pytest.mark.asyncio
async def test_reuploading_same_file_to_same_book_is_allowed(client, db, admin_user, storage):
    book = Book(title="Книга", author="А", description="")
    db.add(book)
    await db.commit()

    assert (await _upload(client, admin_user, book.id)).status_code == 200
    assert (await _upload(client, admin_user, book.id)).status_code == 200


@pytest.mark.asyncio
async def test_check_endpoint_finds_file_and_title(client, db, admin_user):
    digest = hashlib.sha256(PDF).hexdigest()
    db.add(Book(title="Компьютерные сети. 6-е издание", author="Л. Петерсон",
                description="", file_sha256=digest))
    await db.commit()
    headers = auth_headers(admin_user)

    by_file = await client.post("/books/duplicates/check", json={"sha256": digest}, headers=headers)
    assert by_file.json()["duplicate"] is True and by_file.json()["reason"] == "file"

    by_title = await client.post(
        "/books/duplicates/check", json={"title": "компьютерные  сети — 6-е издание"}, headers=headers,
    )
    assert by_title.json()["reason"] == "title"

    fresh = await client.post("/books/duplicates/check", json={"title": "Другая книга"}, headers=headers)
    assert fresh.json() == {"duplicate": False, "reason": None, "book": None}


@pytest.mark.asyncio
async def test_duplicate_endpoints_are_admin_only(client, approved_user):
    headers = auth_headers(approved_user)
    assert (await client.get("/books/duplicates/all", headers=headers)).status_code == 403
    assert (await client.post("/books/duplicates/check", json={}, headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_list_duplicates_groups_by_file_or_title(client, db, admin_user):
    db.add_all([
        Book(title="Управление во время кризиса", author="HBR", description="", file_sha256="a" * 64),
        Book(title="Другая обложка", author="HBR", description="", file_sha256="a" * 64),
        Book(title="Управление во время кризиса!", author="HBR", description=""),
        Book(title="Единственная", author="X", description=""),
    ])
    await db.commit()

    response = await client.get("/books/duplicates/all", headers=auth_headers(admin_user))

    groups = response.json()
    assert len(groups) == 1
    titles = [b["title"] for b in groups[0]["books"]]
    assert titles[0] == "Управление во время кризиса"
    assert len(titles) == 3


def test_normalize_title():
    assert books_service.normalize_title("  Ёжик, в тумане! ") == "ежик в тумане"


# ---------------------------------------------------------------------------
# Нечёткий поиск дублей и объединение
# ---------------------------------------------------------------------------

from datetime import timedelta  # noqa: E402

from sqlalchemy import select  # noqa: E402

from app.models.admin_log import AdminLog  # noqa: E402
from app.models.collection import Collection, collection_books  # noqa: E402
from app.models.library import MyListEntry, MyListStatus, ReadingProgress  # noqa: E402
from app.models.team import ReadingAssignment  # noqa: E402
from app.services.duplicates import title_key  # noqa: E402
from tests.conftest import make_user, utcnow  # noqa: E402


@pytest.mark.parametrize("a, b", [
    ("Python 3 Using DeepSeek, First Edition", "Python 3 Using DeepSeek"),
    ("Node и Express, 2-е издание", "Node и Express. 2-е изд."),
    ("Биоинформатика с Python, третье издание", "Биоинформатика с Python, 3-е издание"),
    ("Экстремальный Си. Параллелизм", "Экстремальный Cи. Параллелизм"),  # латинская C
])
def test_title_key_ignores_spelling_of_the_same_book(a, b):
    assert title_key(a).ident == title_key(b).ident


@pytest.mark.parametrize("a, b", [
    ("Windows Kernel Programming, Second Edition", "Windows Kernel Programming"),
    ("XSS Cheat Sheet, 2020 Edition", "XSS Cheat Sheet, 2018 Edition"),
    ("Компьютерный английский. Часть II", "Компьютерный английский. Часть I"),
    ("История ИТ, Том 5", "История ИТ, Том 4"),
    ("Взлом. Секреты хакеров", "Взлом. Секреты хакеров. Версия 2.0"),
])
def test_title_key_keeps_editions_and_volumes_apart(a, b):
    assert title_key(a).ident != title_key(b).ident


@pytest.mark.asyncio
async def test_fuzzy_groups(client, db, admin_user):
    db.add_all([
        # те же авторы в другом порядке
        Book(title="Знакомство с PyTorch", author="Брайан Макмахан, Делип Рао", description="", total_pages=256),
        Book(title="Знакомство с PyTorch", author="Делип Рао, Брайан Макмахан", description="", total_pages=256),
        # подзаголовок у одной копии, страниц столько же
        Book(title="Облачные микросервисы", author="Кофлер", description="", total_pages=626),
        Book(title="Облачные микросервисы: разработка на Kubernetes", author="Михаэль Кофлер",
             description="", total_pages=626),
        # разные издания — не дубли
        Book(title="Windows Kernel Programming", author="Pavel Yosifovich", description="", total_pages=394),
        Book(title="Windows Kernel Programming, Second Edition", author="Pavel Yosifovich",
             description="", total_pages=612),
        # мусорный автор у копии, но совпадают название и страницы
        Book(title="Cyber Security for Beginners", author="Raef Meeuwisse", description="", total_pages=199),
        Book(title="Cyber Security for Beginners", author="Автор не указан", description="", total_pages=199),
        # одинаковое название, разные авторы и объём — разные книги
        Book(title="Основы Python", author="Иванов", description="", total_pages=100),
        Book(title="Основы Python", author="Петров", description="", total_pages=400),
    ])
    await db.commit()

    groups = (await client.get("/books/duplicates/all", headers=auth_headers(admin_user))).json()
    by_title = {g["books"][0]["title"]: g for g in groups}

    assert set(by_title) == {"Знакомство с PyTorch", "Облачные микросервисы", "Cyber Security for Beginners"}
    assert by_title["Знакомство с PyTorch"]["confidence"] == "certain"
    assert "другом порядке" in by_title["Знакомство с PyTorch"]["reasons"][0]
    assert by_title["Облачные микросервисы"]["confidence"] == "likely"
    # Порядок: сначала точные.
    assert groups[-1]["confidence"] == "likely"


@pytest.mark.asyncio
async def test_merge_moves_user_data_and_deletes_copy(client, db, admin_user, storage):
    keep = Book(title="Книга", author="А", description="", total_pages=100,
                pdf_storage_key="books/keep.pdf", views=5)
    dup = Book(title="Книга", author="А", description="", total_pages=100,
               pdf_storage_key="books/dup.pdf", views=3)
    db.add_all([keep, dup])
    await db.commit()
    storage.files.update({"books/keep.pdf": b"1", "books/dup.pdf": b"2"})

    only_dup = await make_user(db, username="only_dup")
    both = await make_user(db, username="both")
    now = utcnow()
    collection = Collection(user_id=only_dup.id, name="Моя")
    db.add_all([
        ReadingProgress(user_id=only_dup.id, book_id=dup.id, current_page=40, total_pages=100, last_read_at=now),
        # у этого читателя прогресс на обеих; на копии свежее — он и останется
        ReadingProgress(user_id=both.id, book_id=keep.id, current_page=10, total_pages=100,
                        last_read_at=now - timedelta(days=3)),
        ReadingProgress(user_id=both.id, book_id=dup.id, current_page=70, total_pages=100, last_read_at=now),
        MyListEntry(user_id=only_dup.id, book_id=dup.id, status=MyListStatus.READING),
        ReadingAssignment(department="CVV", book_id=dup.id),
        collection,
    ])
    await db.commit()
    await db.execute(collection_books.insert().values(collection_id=collection.id, book_id=dup.id))
    await db.commit()

    keep_id, dup_id, only_dup_id, both_id = keep.id, dup.id, only_dup.id, both.id
    response = await client.post(
        "/books/duplicates/merge", json={"keep_id": keep_id, "remove_ids": [dup_id]},
        headers=auth_headers(admin_user),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"kept": keep_id, "removed": [dup_id], "moved_readers": 2}
    db.expire_all()
    assert await db.get(Book, dup_id) is None
    progress = {
        p.user_id: p.current_page
        for p in (await db.scalars(select(ReadingProgress).where(ReadingProgress.book_id == keep_id))).all()
    }
    assert progress == {only_dup_id: 40, both_id: 70}
    assert (await db.scalar(select(MyListEntry.book_id).where(MyListEntry.user_id == only_dup_id))) == keep_id
    assert (await db.scalar(select(ReadingAssignment.book_id).where(ReadingAssignment.department == "CVV"))) == keep_id
    assert (await db.scalar(select(collection_books.c.book_id))) == keep_id
    assert (await db.get(Book, keep_id)).views == 8
    assert "books/dup.pdf" not in storage.files and "books/keep.pdf" in storage.files
    log = await db.scalar(select(AdminLog).where(AdminLog.action == "book_merge"))
    assert log is not None and str(dup_id) in log.detail


@pytest.mark.asyncio
async def test_merge_validation(client, db, admin_user, approved_user):
    book = Book(title="Одна", author="А", description="")
    db.add(book)
    await db.commit()
    headers = auth_headers(admin_user)

    same = await client.post("/books/duplicates/merge", json={"keep_id": book.id, "remove_ids": [book.id]},
                             headers=headers)
    assert same.status_code == 400
    missing = await client.post("/books/duplicates/merge", json={"keep_id": book.id, "remove_ids": [999999]},
                                headers=headers)
    assert missing.status_code == 404
    forbidden = await client.post("/books/duplicates/merge", json={"keep_id": book.id, "remove_ids": [1]},
                                  headers=auth_headers(approved_user))
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_different_issues_and_levels_are_not_duplicates(client, db, admin_user):
    """Ложные «дубли», найденные на живом каталоге."""
    db.add_all([
        Book(title="Cyber Defense eMagazine – February 2023 Edition", author="Cyber Defense Media Group", description="", total_pages=186),
        Book(title="Cyber Defense eMagazine, July 2023 Edition", author="Cyber Defense Media Group", description="", total_pages=182),
        Book(title="SQL for Data Analysis: A Middle-Level Guide", author="Joe Smith", description="", total_pages=234),
        Book(title="SQL for Data Analysis: A Pro-Level Guide", author="Joe Smith", description="", total_pages=237),
        Book(title="Занимайся хакингом с ловкостью Бога", author="Спарк Флоу", description="", total_pages=152),
        Book(title="Занимайся хакингом с ловкостью ниндзя", author="Спарк Флоу", description="", total_pages=155),
    ])
    await db.commit()

    groups = (await client.get("/books/duplicates/all", headers=auth_headers(admin_user))).json()

    assert groups == []
