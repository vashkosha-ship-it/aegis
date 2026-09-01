"""Smoke tests — verify imports and route registration without hitting the DB."""
from app.main import app


def test_app_creates() -> None:
    assert app.title == "NEON STACK"


def _registered_paths() -> set[str]:
    """Пути всех зарегистрированных маршрутов.

    Берём из OpenAPI-схемы, а не из app.routes. Причина в том, что устройство
    app.routes меняется между версиями FastAPI: раньше это был плоский список,
    теперь подключённые роутеры спрятаны внутрь объектов _IncludedRouter, и
    наружу выставлены только маршруты из main.py — шесть штук вместо восьмидесяти.

    Для проверки, которая ищет пропажу маршрута, это худший вид поломки: она
    продолжает проходить, просто смотрит почти в пустоту. Схема — публичный
    контракт приложения, на неё опираться безопаснее.
    """
    schema = app.openapi()
    paths = set(schema.get("paths", {}))
    # Маршруты, не попадающие в схему (include_in_schema=False), добавляем
    # напрямую — их немного и они объявлены прямо в main.py.
    paths.update(
        path for path in (getattr(r, "path", None) for r in app.routes)
        if path is not None
    )
    return paths


def test_routes_registered() -> None:
    paths = _registered_paths()
    expected = {
        "/health",
        "/api/auth/register",
        "/api/auth/login",
        "/api/auth/me",
        "/api/books",
        "/api/books/{book_id}",
        "/api/admin/dashboard",
        "/api/me/leaderboard",
    }
    missing = expected - paths
    assert not missing, f"Missing routes: {missing}"


def test_route_listing_is_not_empty() -> None:
    """Страховка к проверке выше.

    У всякой проверки, которая ищет нарушения перебором, должно быть
    утверждение о том, что перебор непустой. Иначе она превращается в тест,
    который нельзя провалить: список пуст, нарушений не найдено, всё зелено.
    Ровно это и произошло, когда app.routes перестал разворачивать вложенные
    роутеры.
    """
    assert len(_registered_paths()) > 50


def test_password_hashing_round_trip() -> None:
    from app.core.security import hash_password, verify_password

    pw = "Sup3rSecret!"
    h = hash_password(pw)
    assert h != pw
    assert verify_password(pw, h)
    assert not verify_password("wrong", h)


def test_jwt_round_trip() -> None:
    from app.core.security import create_access_token, decode_token

    token = create_access_token(subject=42, role="reader")
    payload = decode_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "reader"
    assert payload["type"] == "access"


def test_xp_level_calculation() -> None:
    from app.services.gamification import calculate_level

    assert calculate_level(0)["level"] == 1
    assert calculate_level(50)["level"] == 1
    assert calculate_level(100)["level"] == 2  # 100 нужно для перехода с 1 на 2
    assert calculate_level(300)["level"] == 3  # 100+200
    assert calculate_level(600)["level"] == 4  # 100+200+300
