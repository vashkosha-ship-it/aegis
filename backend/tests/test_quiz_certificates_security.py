"""Тесты на накрутку результатов: квизы и экзамены на сертификат."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.certificate import Certificate
from app.models.exam_session import ExamSession
from app.models.quiz import QuizAttempt
from tests.conftest import auth_headers, make_user


class TestQuizXpFarming:
    """XP начисляется только за первую успешную сдачу."""

    async def _pass_quiz(self, client, user, book):
        r = await client.get(f"/books/{book.id}/quiz", headers=auth_headers(user))
        assert r.status_code == 200
        questions = r.json()
        token = r.headers.get("X-Quiz-Session")
        assert token, "Сервер должен выдавать токен сессии в X-Quiz-Session"

        # Отвечаем правильно: correct_index известен из фикстуры (i % 4),
        # но клиент его не видит — берём из БД в тесте.
        return questions, token

    async def test_xp_awarded_once(self, client, db, approved_user, book_with_quiz):
        from app.models.quiz import QuizQuestion

        rows = (await db.scalars(
            select(QuizQuestion).where(QuizQuestion.book_id == book_with_quiz.id)
        )).all()
        correct_by_id = {q.id: q.correct_index for q in rows}

        async def submit_all_correct():
            r = await client.get(
                f"/books/{book_with_quiz.id}/quiz", headers=auth_headers(approved_user)
            )
            questions = r.json()
            token = r.headers.get("X-Quiz-Session")
            answers = [correct_by_id[q["id"]] for q in questions]
            return await client.post(
                f"/books/{book_with_quiz.id}/quiz/submit",
                headers=auth_headers(approved_user),
                json={"answers": answers, "session_token": token},
            )

        r1 = await submit_all_correct()
        assert r1.status_code == 201
        assert r1.json()["percentage"] == 100

        await db.refresh(approved_user)
        xp_after_first = approved_user.xp
        assert xp_after_first > 0

        r2 = await submit_all_correct()
        assert r2.status_code == 201

        await db.refresh(approved_user)
        assert approved_user.xp == xp_after_first, (
            "Повторная сдача не должна начислять XP — иначе тест можно фармить"
        )

    async def test_attempt_still_recorded_on_retake(
        self, client, db, approved_user, book_with_quiz
    ):
        """Попытки сохраняются даже без XP — статистика не ломается."""
        from app.models.quiz import QuizQuestion

        rows = (await db.scalars(
            select(QuizQuestion).where(QuizQuestion.book_id == book_with_quiz.id)
        )).all()
        correct_by_id = {q.id: q.correct_index for q in rows}

        for _ in range(2):
            r = await client.get(
                f"/books/{book_with_quiz.id}/quiz", headers=auth_headers(approved_user)
            )
            questions = r.json()
            token = r.headers.get("X-Quiz-Session")
            answers = [correct_by_id[q["id"]] for q in questions]
            await client.post(
                f"/books/{book_with_quiz.id}/quiz/submit",
                headers=auth_headers(approved_user),
                json={"answers": answers, "session_token": token},
            )

        attempts = (await db.scalars(
            select(QuizAttempt).where(QuizAttempt.user_id == approved_user.id)
        )).all()
        assert len(attempts) == 2


class TestQuizSessionIntegrity:
    """Набор вопросов задаёт сервер, а не клиент."""

    async def test_single_question_submit_rejected(
        self, client, approved_user, book_with_quiz
    ):
        """Раньше можно было прислать один вопрос, ответить верно и получить 100%."""
        r = await client.post(
            f"/books/{book_with_quiz.id}/quiz/submit",
            headers=auth_headers(approved_user),
            json={"answers": [0], "question_ids": [1]},
        )
        assert r.status_code == 400

    async def test_duplicate_question_ids_rejected(
        self, client, db, approved_user, book_with_quiz
    ):
        from app.models.quiz import QuizQuestion

        rows = (await db.scalars(
            select(QuizQuestion).where(QuizQuestion.book_id == book_with_quiz.id)
        )).all()
        qid = rows[0].id
        r = await client.post(
            f"/books/{book_with_quiz.id}/quiz/submit",
            headers=auth_headers(approved_user),
            json={"answers": [0] * 15, "question_ids": [qid] * 15},
        )
        assert r.status_code == 400

    async def test_session_cannot_be_reused(
        self, client, db, approved_user, book_with_quiz
    ):
        r = await client.get(
            f"/books/{book_with_quiz.id}/quiz", headers=auth_headers(approved_user)
        )
        questions = r.json()
        token = r.headers.get("X-Quiz-Session")
        answers = [0] * len(questions)

        first = await client.post(
            f"/books/{book_with_quiz.id}/quiz/submit",
            headers=auth_headers(approved_user),
            json={"answers": answers, "session_token": token},
        )
        assert first.status_code == 201

        second = await client.post(
            f"/books/{book_with_quiz.id}/quiz/submit",
            headers=auth_headers(approved_user),
            json={"answers": answers, "session_token": token},
        )
        assert second.status_code == 409, "Сессия одноразовая"

    async def test_foreign_session_rejected(
        self, client, db, approved_user, book_with_quiz
    ):
        other = await make_user(db, username="other")
        r = await client.get(
            f"/books/{book_with_quiz.id}/quiz", headers=auth_headers(other)
        )
        token = r.headers.get("X-Quiz-Session")
        questions = r.json()

        r2 = await client.post(
            f"/books/{book_with_quiz.id}/quiz/submit",
            headers=auth_headers(approved_user),
            json={"answers": [0] * len(questions), "session_token": token},
        )
        assert r2.status_code == 404, "Чужую сессию использовать нельзя"


class TestExamSession:
    """Экзамен на сертификат: один токен — одна попытка."""

    async def _make_exam(self, db, user, correct=None, minutes=120):
        correct = correct if correct is not None else [0] * 50
        exam = ExamSession(
            token="testtoken123",
            user_id=user.id,
            category="Криптография",
            correct=correct,
            total=len(correct),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes),
        )
        db.add(exam)
        await db.commit()
        return exam

    async def test_result_frozen_on_resubmit(self, client, db, approved_user):
        """Ключевая дыра: по correct_count можно было подбирать ответы."""
        await self._make_exam(db, approved_user, correct=[0] * 50)

        wrong = [1] * 50
        r1 = await client.post(
            "/certificates/exam/submit",
            headers=auth_headers(approved_user),
            json={"exam_token": "testtoken123", "answers": wrong},
        )
        assert r1.status_code == 200
        assert r1.json()["correct_count"] == 0

        # Пробуем «подобрать» — присылаем правильные ответы тем же токеном
        r2 = await client.post(
            "/certificates/exam/submit",
            headers=auth_headers(approved_user),
            json={"exam_token": "testtoken123", "answers": [0] * 50},
        )
        assert r2.status_code == 200
        assert r2.json()["correct_count"] == 0, (
            "Результат должен быть зафиксирован при первой отправке"
        )
        assert r2.json()["passed"] is False

    async def test_foreign_exam_token_rejected(self, client, db, approved_user):
        victim = await make_user(db, username="victim")
        await self._make_exam(db, victim)

        r = await client.post(
            "/certificates/exam/submit",
            headers=auth_headers(approved_user),
            json={"exam_token": "testtoken123", "answers": [0] * 50},
        )
        assert r.status_code == 404

    async def test_expired_exam_rejected(self, client, db, approved_user):
        await self._make_exam(db, approved_user, minutes=-1)
        r = await client.post(
            "/certificates/exam/submit",
            headers=auth_headers(approved_user),
            json={"exam_token": "testtoken123", "answers": [0] * 50},
        )
        assert r.status_code == 404

    async def test_certificate_issued_after_name_filled(self, client, db):
        """Легитимный сценарий: прошёл без ФИО, заполнил, отправил повторно."""
        user = await make_user(db, username="noname", full_name=None)
        await self._make_exam(db, user, correct=[0] * 50)

        r1 = await client.post(
            "/certificates/exam/submit",
            headers=auth_headers(user),
            json={"exam_token": "testtoken123", "answers": [0] * 50},
        )
        assert r1.status_code == 200
        assert r1.json()["passed"] is True
        assert r1.json()["needs_full_name"] is True

        user.full_name = "Иванов Иван"
        await db.commit()

        r2 = await client.post(
            "/certificates/exam/submit",
            headers=auth_headers(user),
            json={"exam_token": "testtoken123", "answers": [0] * 50},
        )
        assert r2.status_code == 200
        assert r2.json()["needs_full_name"] is False

        cert = await db.scalar(
            select(Certificate).where(Certificate.user_id == user.id)
        )
        assert cert is not None, "Сертификат должен выдаться после заполнения ФИО"
