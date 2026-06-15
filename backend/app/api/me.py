"""User self-service endpoints: edit own profile, manage avatar."""
import logging
from collections.abc import AsyncIterator
from typing import Optional

from pydantic import BaseModel, EmailStr, Field
from app.core.security import hash_password, verify_password

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.file_validation import (
    FileValidationError,
    detect_cover_ext,
)
from app.core.storage import (
    StorageBackend,
    StorageError,
    StorageNotFound,
    get_storage,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import UserPublic, UserUpdate

logger = logging.getLogger(__name__)
router = APIRouter(tags=["me"])

# Лимит для аватара. Аватары — небольшие, 2 МБ за глаза.
_MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
_MAGIC_HEAD_BYTES = 16


async def _stream_remainder(
    file: UploadFile, head: bytes, chunk_size: int = 1024 * 1024
) -> AsyncIterator[bytes]:
    """Отдать сначала уже прочитанный head, потом дочитать поток до конца."""
    if head:
        yield head
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        yield chunk


# ============================================================================
# PATCH /api/me — изменение полей профиля
# ============================================================================


@router.patch("/me", response_model=UserPublic)
async def update_me(
    payload: UserUpdate,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    """Изменить отображаемое имя и подразделение в профиле.

    Username и email не меняются через этот эндпоинт — они требуют
    дополнительных проверок (уникальность, верификация почты).
    """
    if payload.full_name is not None:
        fn = payload.full_name.strip()
        current.full_name = fn if fn else None

    if payload.department is not None:
        dep = payload.department.strip()
        current.department = dep if dep else None

    await db.commit()
    await db.refresh(current)
    return UserPublic.model_validate(current)

# ============================================================================
# POST /api/me/password — смена пароля
# ============================================================================


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(
    payload: PasswordChangeRequest,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Поменять свой пароль.

    Требуется текущий пароль (защита от ситуации «забыл выйти на чужом компе»).
    Новый пароль — минимум 8 символов, максимум 128.
    """
    # Проверяем текущий пароль
    if not verify_password(payload.current_password, current.password_hash):
        # Не раскрываем точную причину (даём общую ошибку)
        raise HTTPException(status_code=401, detail="Текущий пароль неверный")

    # Запрет ставить тот же пароль
    if verify_password(payload.new_password, current.password_hash):
        raise HTTPException(status_code=400, detail="Новый пароль не должен совпадать с текущим")

    # Дополнительные проверки сложности
    if len(payload.new_password.strip()) < 8:
        raise HTTPException(status_code=400, detail="Пароль должен быть не короче 8 символов")

    current.password_hash = hash_password(payload.new_password)
    await db.commit()

    logger.info("User %s changed own password", current.id)


# ============================================================================
# Смена email с подтверждением по коду (G/SMTP)
# ============================================================================


class EmailChangeRequest(BaseModel):
    new_email: EmailStr
    password: str = Field(..., min_length=1)


class EmailChangeConfirm(BaseModel):
    code: str = Field(..., min_length=4, max_length=16)


@router.post("/me/email/request", status_code=status.HTTP_202_ACCEPTED)
async def request_email_change(
    payload: EmailChangeRequest,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Запросить смену email. Отправляет код подтверждения на НОВЫЙ адрес."""
    from datetime import datetime, timedelta, timezone
    import secrets

    from sqlalchemy import select

    from app.services.email_service import send_email_change_code

    if not verify_password(payload.password, current.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль")

    new_email = payload.new_email.lower().strip()
    if new_email == (current.email or "").lower():
        raise HTTPException(status_code=400, detail="Это уже ваш текущий email")

    # email не должен быть занят другим пользователем
    exists = await db.scalar(select(User).where(User.email == new_email))
    if exists and exists.id != current.id:
        raise HTTPException(status_code=400, detail="Этот email уже используется")

    code = f"{secrets.randbelow(1000000):06d}"  # 6-значный код
    current.pending_email = new_email
    current.email_change_code = code
    current.email_change_expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    await db.commit()

    await send_email_change_code(new_email, code)
    logger.info("User %s requested email change to %s", current.id, new_email)
    return {"status": "code_sent", "email": new_email}


@router.post("/me/email/confirm", response_model=UserPublic)
async def confirm_email_change(
    payload: EmailChangeConfirm,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    """Подтвердить смену email кодом из письма."""
    from datetime import datetime, timezone

    if not current.pending_email or not current.email_change_code:
        raise HTTPException(status_code=400, detail="Нет активного запроса на смену email")

    if current.email_change_expires and datetime.now(timezone.utc) > current.email_change_expires:
        current.pending_email = None
        current.email_change_code = None
        current.email_change_expires = None
        await db.commit()
        raise HTTPException(status_code=400, detail="Срок действия кода истёк. Запросите новый.")

    if payload.code.strip() != current.email_change_code:
        raise HTTPException(status_code=400, detail="Неверный код")

    current.email = current.pending_email
    current.pending_email = None
    current.email_change_code = None
    current.email_change_expires = None
    await db.commit()
    await db.refresh(current)

    logger.info("User %s confirmed email change", current.id)
    return UserPublic.model_validate(current)


# ============================================================================
# DELETE /api/me — удаление аккаунта (подтверждение паролем)
# ============================================================================


class AccountDeleteRequest(BaseModel):
    password: str = Field(..., min_length=1)
    confirm: str = Field(..., description="Должно быть 'УДАЛИТЬ' для подтверждения")


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    payload: AccountDeleteRequest,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
) -> None:
    """Удалить свой аккаунт безвозвратно.

    Требует пароль и слово-подтверждение. SMTP в проекте не настроен,
    поэтому подтверждение по email заменено на подтверждение паролем —
    это надёжно защищает от случайного и чужого удаления.

    Все связанные данные (списки, прогресс, заметки, попытки тестов,
    достижения, коллекции) удаляются каскадно через ondelete=CASCADE.
    """
    if not verify_password(payload.password, current.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль")

    if payload.confirm.strip().upper() != "УДАЛИТЬ":
        raise HTTPException(status_code=400, detail="Подтверждение неверное")

    avatar_key = current.avatar_url
    user_id = current.id

    await db.delete(current)
    await db.commit()

    # Удаляем аватар из хранилища уже после успешного удаления из БД
    if avatar_key:
        try:
            await storage.delete(avatar_key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete avatar for removed user %s", user_id)

    logger.info("User %s deleted own account", user_id)


# ============================================================================
# Avatar: upload / download / delete
# ============================================================================


@router.post("/me/avatar", response_model=UserPublic, status_code=status.HTTP_200_OK)
async def upload_my_avatar(
    file: UploadFile = File(..., description="Аватар (JPEG/PNG/WEBP, до 2 МБ)"),
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
) -> UserPublic:
    """Загрузить новый аватар. Старый удаляется."""
    head = await file.read(_MAGIC_HEAD_BYTES)
    try:
        ext = detect_cover_ext(head, declared_mime=file.content_type)
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    old_key = current.avatar_url
    new_key = StorageBackend.make_key("avatars", ext)

    try:
        await storage.save_stream(
            new_key,
            _stream_remainder(file, head),
            max_bytes=_MAX_AVATAR_SIZE_BYTES,
        )
    except StorageError as e:
        raise HTTPException(status_code=413, detail=str(e)) from None

    current.avatar_url = new_key
    await db.commit()
    await db.refresh(current)

    # Удаляем старый файл уже после коммита, чтобы не убить аватар при ошибке БД
    if old_key:
        try:
            await storage.delete(old_key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete old avatar %s for user %s", old_key, current.id)

    logger.info("User %s uploaded avatar (key=%s)", current.id, new_key)
    return UserPublic.model_validate(current)


@router.delete("/me/avatar", response_model=UserPublic)
async def delete_my_avatar(
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
) -> UserPublic:
    """Удалить свой аватар. Идемпотентно."""
    if not current.avatar_url:
        return UserPublic.model_validate(current)

    key = current.avatar_url
    current.avatar_url = None
    await db.commit()
    await db.refresh(current)

    try:
        await storage.delete(key)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to delete avatar %s for user %s", key, current.id)

    logger.info("User %s deleted own avatar", current.id)
    return UserPublic.model_validate(current)


# ============================================================================
# GET /api/users/{user_id}/avatar — отдача аватара (для просмотра другими)
# ============================================================================

# Этот роутер монтируется отдельно с другим префиксом
users_router = APIRouter(prefix="/users", tags=["users"])


@users_router.get("/{user_id}/avatar")
async def download_user_avatar(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
    # Авторизация не требуется: аватары — публичные (как обложки)
) -> StreamingResponse:
    """Получить аватар юзера по id. 404 если нет."""
    user = await db.get(User, user_id)
    if not user or not user.avatar_url:
        raise HTTPException(status_code=404, detail="Avatar not found")

    key = user.avatar_url
    try:
        size = await storage.size(key)
        chunks = await storage.open_stream(key)
    except StorageNotFound:
        logger.error("Avatar missing for user %s (key=%s)", user_id, key)
        raise HTTPException(status_code=404, detail="Avatar file is missing") from None

    ext_to_mime = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = "application/octet-stream"
    for ext, mime in ext_to_mime.items():
        if key.endswith(ext):
            media_type = mime
            break

    return StreamingResponse(
        chunks,
        media_type=media_type,
        headers={
            "Content-Length": str(size),
            # Аватары меняются редко, можно кэшировать. Но не слишком долго,
            # чтобы юзер увидел свой новый аватар сразу. 5 минут — компромисс.
            "Cache-Control": "public, max-age=300",
        },
    )


# ============================================================================
# GET /api/users/{user_id}/profile — публичный профиль (#15 маскировка email)
# ============================================================================
from sqlalchemy import func, select  # noqa: E402
from app.models.library import MyListEntry  # noqa: E402
from app.models.quiz import QuizAttempt  # noqa: E402


def _mask_email(email: str | None) -> str | None:
    """Маскирует email: ivan.petrov@mail.ru -> i***v@mail.ru."""
    if not email or "@" not in email:
        return None
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[0] + "***" + local[-1]
    return f"{masked}@{domain}"


class PublicProfile(BaseModel):
    id: int
    username: str
    full_name: str | None
    department: str | None
    cyber_level: str | None
    xp: int
    streak_count: int
    has_avatar: bool
    email_masked: str | None = None  # замаскированный email (или None если скрыт)
    books_count: int = 0
    quizzes_passed: int = 0


@users_router.get("/{user_id}/profile", response_model=PublicProfile)
async def get_public_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> PublicProfile:
    """Публичный профиль пользователя.

    Учитывает profile_visibility:
      - 'public'  — видят все авторизованные;
      - 'private' — виден только владельцу (иначе 403).
    Email всегда маскируется (#15), даже для публичных профилей.
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    is_owner = current.id == user.id
    if user.profile_visibility == "private" and not is_owner:
        raise HTTPException(status_code=403, detail="Профиль скрыт настройками приватности")

    books_count = await db.scalar(
        select(func.count(MyListEntry.id)).where(MyListEntry.user_id == user_id)
    ) or 0
    quizzes_passed = await db.scalar(
        select(func.count(QuizAttempt.id)).where(
            QuizAttempt.user_id == user_id, QuizAttempt.percentage >= 60
        )
    ) or 0

    return PublicProfile(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        department=user.department,
        cyber_level=user.cyber_level,
        xp=user.xp,
        streak_count=user.streak_count,
        has_avatar=bool(user.avatar_url),
        # маскированный email показываем только если профиль публичный
        email_masked=_mask_email(user.email) if user.profile_visibility == "public" else None,
        books_count=books_count,
        quizzes_passed=quizzes_passed,
    )