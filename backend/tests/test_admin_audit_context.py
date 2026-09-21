"""Административное изменение и audit trail фиксируются вместе."""

from pathlib import Path

from sqlalchemy import select

from app.models.admin_log import AdminLog
from tests.conftest import auth_headers, make_user


async def test_user_approval_records_actor_target_result_request_and_ip(
    client, db, admin_user
):
    pending = await make_user(db, username="audit_target", is_approved=False)
    response = await client.post(
        f"/admin/users/{pending.id}/approve",
        headers={**auth_headers(admin_user), "X-Request-ID": "audit-test-123"},
    )
    assert response.status_code == 200, response.text
    assert response.headers["X-Request-ID"] == "audit-test-123"

    entry = await db.scalar(
        select(AdminLog).where(AdminLog.action == "user_approve")
    )
    assert entry is not None
    assert entry.admin_id == admin_user.id
    assert entry.target == f"user:{pending.id}:{pending.username}"
    assert entry.result == "success"
    assert entry.request_id == "audit-test-123"
    assert entry.ip_address


async def test_invalid_request_id_is_replaced(client):
    response = await client.get(
        "../health", headers={"X-Request-ID": "bad id with spaces"}
    )
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] != "bad id with spaces"
    assert len(response.headers["X-Request-ID"]) == 32


def test_security_sensitive_admin_actions_use_central_audit_service():
    api_dir = Path(__file__).parents[1] / "app" / "api"
    source = "\n".join(
        (api_dir / name).read_text(encoding="utf-8")
        for name in ("admin.py", "books.py", "quizzes.py")
    )
    for action in (
        "user_create",
        "user_delete",
        "user_approve",
        "user_reject",
        "storage_cleanup",
        "book_create",
        "book_update",
        "book_delete",
        "pdf_upload",
        "epub_upload",
        "cover_upload",
        "pdf_delete",
        "epub_delete",
        "cover_delete",
        "book_reindex",
        "books_reindex_all",
        "book_description_generate",
        "book_descriptions_generate",
        "books_ai_match_ar",
        "quiz_regenerate",
        "quizzes_regenerate_all",
    ):
        assert f'"{action}"' in source, f"Нет admin-audit для {action}"
