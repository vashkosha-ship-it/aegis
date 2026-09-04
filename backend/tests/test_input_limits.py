"""Границы пользовательского ввода для административных API."""
import pytest
from pydantic import ValidationError

from app.schemas.admin import CreateUserRequest
from app.schemas.book import BookCreate, BookUpdate


@pytest.mark.parametrize(
    "field,value",
    [
        ("description", "x" * 20_001),
        ("icon", "x" * 65),
        ("categories", [f"category-{i}" for i in range(21)]),
    ],
)
def test_book_create_rejects_oversized_fields(field, value):
    payload = {
        "title": "Книга",
        "author": "Автор",
        "categories": [],
        field: value,
    }
    with pytest.raises(ValidationError):
        BookCreate.model_validate(payload)


@pytest.mark.parametrize("field", ["title", "author"])
def test_book_update_rejects_empty_required_text(field):
    with pytest.raises(ValidationError):
        BookUpdate.model_validate({field: ""})


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "password": "long-enough"},
        {"username": "invalid name", "password": "long-enough"},
        {"username": "valid_name", "password": "short"},
        {"username": "valid_name", "password": "x" * 129},
        {"username": "valid_name", "password": "long-enough", "full_name": "x" * 129},
        {"username": "valid_name", "password": "long-enough", "department": "x" * 65},
    ],
)
def test_admin_create_user_rejects_invalid_or_oversized_input(payload):
    with pytest.raises(ValidationError):
        CreateUserRequest.model_validate(payload)


def test_admin_create_user_accepts_supported_input():
    request = CreateUserRequest(
        username="reader_01",
        password="a-long-development-password",
        full_name="Иван Иванов",
        department="ИБ",
    )
    assert request.username == "reader_01"
