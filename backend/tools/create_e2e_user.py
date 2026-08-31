"""Создать или обновить учётную запись для браузерных проверок.

Регистрация через интерфейс требует кода подтверждения из письма — для
служебной учётки это лишний шаг. Скрипт заводит пользователя напрямую и сразу
помечает подтверждённым.

Запускать на сервере, из каталога backend:

    SEED_E2E_PASSWORD='...' .venv/bin/python -m tools.create_e2e_user

или с явными параметрами:

    SEED_E2E_PASSWORD='...' .venv/bin/python -m tools.create_e2e_user \\
        --username e2e_probe --email e2e@example.local

Если пользователь уже есть, скрипт меняет ему пароль и подтверждает учётку.
Пароль печатать не будем: он и так известен тому, кто его задал, а вывод
попадает в историю терминала.

ВАЖНО: эта учётка используется тестами, которые выполняют выход и отзывают
сессии. Обычным аккаунтом их запускать нельзя.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole

MIN_PASSWORD_LENGTH = 16

# Колонки, которые надо выставить в True, чтобы учётка была рабочей.
# Ищем по смыслу имени, а не по точному совпадению: набор полей менялся, и
# захардкоженный список тихо устарел бы.
TRUTHY_MARKERS = ("verified", "confirmed", "approved", "active")

# Колонки, которые надо очистить: незакрытая заявка на подтверждение может
# мешать входу.
NULLABLE_MARKERS = ("verification_code", "verification_expires", "reset_code")


def _read_password() -> str:
    password = os.environ.get("SEED_E2E_PASSWORD", "")
    if not password:
        print(
            "Не задана переменная SEED_E2E_PASSWORD.\n"
            "Сгенерировать пароль:\n"
            "  python -c \"import secrets; print(secrets.token_urlsafe(24))\"",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if len(password) < MIN_PASSWORD_LENGTH:
        print(
            f"Пароль короче {MIN_PASSWORD_LENGTH} символов. Учётка живёт на "
            "работающем сайте и доступна из сети — короткий пароль подбирается "
            "быстрее, чем вы дочитаете это сообщение.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return password


def _apply_flags(user: User) -> list[str]:
    """Проставить всё, что делает учётку рабочей. Возвращает изменённые поля."""
    columns = {c.key for c in sa_inspect(User).mapper.column_attrs}
    changed: list[str] = []

    for column in sorted(columns):
        lowered = column.lower()
        wants_true = any(marker in lowered for marker in TRUTHY_MARKERS)
        wants_null = any(marker in lowered for marker in NULLABLE_MARKERS)

        if wants_true and getattr(user, column, None) is not True:
            setattr(user, column, True)
            changed.append(f"{column}=True")
        elif wants_null and getattr(user, column, None) is not None:
            setattr(user, column, None)
            changed.append(f"{column}=None")

    return changed


async def run(username: str, email: str, password: str) -> None:
    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.username == username))

        if user is None:
            user = User(
                username=username,
                email=email,
                password_hash=hash_password(password),
                full_name="E2E Probe",
                role=UserRole.READER,
            )
            db.add(user)
            action = "создан"
        else:
            user.password_hash = hash_password(password)
            action = "обновлён"

        changed = _apply_flags(user)
        await db.commit()
        await db.refresh(user)

        print(f"Пользователь {username} {action} (id={user.id})")
        if changed:
            print("Проставлено: " + ", ".join(changed))
        print(
            "\nТеперь можно запускать проверки:\n"
            f"  E2E_USERNAME={username} E2E_PASSWORD=... npm test"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Создать учётную запись для браузерных проверок.",
    )
    parser.add_argument("--username", default="e2e_probe")
    parser.add_argument("--email", default="e2e-probe@aegis.local")
    args = parser.parse_args()

    asyncio.run(run(args.username, args.email, _read_password()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
