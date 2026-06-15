"""Smoke tests — verify imports and route registration without hitting the DB."""
from app.main import app


def test_app_creates() -> None:
    assert app.title == "NEON STACK"


def test_routes_registered() -> None:
    paths = {route.path for route in app.routes}
    expected = {
        "/health",
        "/api/auth/register",
        "/api/auth/login",
        "/api/auth/me",
        "/api/books",
        "/api/books/{book_id}",
        "/api/admin/dashboard",
        "/api/admin/leaderboard",
    }
    missing = expected - paths
    assert not missing, f"Missing routes: {missing}"


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
