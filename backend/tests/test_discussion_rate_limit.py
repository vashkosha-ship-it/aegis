"""Регрессии rate limit обсуждений книг."""
from __future__ import annotations

from tests.conftest import auth_headers


async def test_sixth_comment_is_rejected(
    client, approved_user, book_with_quiz
):
    """Дублированный _record_comment раньше писал не в проверяемый счётчик."""
    headers = auth_headers(approved_user)
    statuses = []

    for number in range(6):
        response = await client.post(
            f"/books/{book_with_quiz.id}/comments",
            headers=headers,
            json={"text": f"Комментарий {number + 1}"},
        )
        statuses.append(response.status_code)

    assert statuses[:5] == [201] * 5
    assert statuses[5] == 429
