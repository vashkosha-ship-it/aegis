"""User self-service endpoints: edit own profile, manage avatar."""
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_current_user_any,
    get_current_user_optional,
)
from app.core.avatars import preset_path
from app.core.legal import LEGAL_VERSION
from app.core.rate_limit import email_send_limiter, otp_attempt_limiter
from app.core.security import hash_new_password, hash_otp, verify_otp, verify_password
from app.core.storage import (
    StorageBackend,
    StorageNotFound,
    get_storage,
)
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.auth import LegalConsentRequest, UserPublic, UserUpdate
from app.schemas.me import (
    AccountDeleteRequest,
    EmailChangeConfirm,
    EmailChangeRequest,
    LeaderboardEntry,
    PasswordChangeRequest,
    PublicProfile,
)
from app.schemas.usage import UsageReport
from app.services.org import is_known_unit

logger = logging.getLogger(__name__)
router = APIRouter(tags=["me"])

# ============================================================================
# PATCH /api/me — изменение полей профиля
# ============================================================================


@router.patch("/me", response_model=UserPublic)
async def update_me(
    payload: UserUpdate,
    current: User = Depends(get_current_user_any),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
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
        if dep and dep != current.department and not await is_known_unit(db, dep):
            raise HTTPException(status_code=422, detail="Выберите подразделение из списка")
        current.department = dep if dep else None

    if payload.profile_visibility is not None:
        current.profile_visibility = payload.profile_visibility

    if payload.ui_theme is not None:
        current.ui_theme = payload.ui_theme
    if payload.ui_accent is not None:
        current.ui_accent = payload.ui_accent
    if payload.appearance_onboarded:
        current.appearance_onboarded = True
    if payload.resume_hidden is not None:
        # Без повторов, порядок сохраняем.
        current.resume_hidden = list(dict.fromkeys(payload.resume_hidden))

    # Выбор аватара из набора заменяет ранее загруженное фото.
    old_upload = None
    if payload.avatar_preset is not None:
        current.avatar_preset = payload.avatar_preset
        old_upload, current.avatar_url = current.avatar_url, None

    await db.commit()
    await db.refresh(current)
    if old_upload:
        try:
            await storage.delete(old_upload)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete old avatar %s for user %s", old_upload, current.id)
    return UserPublic.model_validate(current)

# ============================================================================
# POST /api/me/legal-consent — принять текущую редакцию документов
# ============================================================================


@router.post("/me/legal-consent", response_model=UserPublic)
async def accept_legal_documents(
    payload: LegalConsentRequest,
    current: User = Depends(get_current_user_any),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    """Записать согласие с текущей редакцией документов.

    Нужно тем, кто зарегистрировался до появления отдельного согласия на
    обработку персональных данных, и всем — после выхода новой редакции.
    Обе отметки обязательны: схема принимает только true.
    """
    now = datetime.now(UTC)
    current.terms_accepted_at = now
    current.pd_consent_at = now
    current.legal_version = LEGAL_VERSION
    await db.commit()
    await db.refresh(current)
    logger.info("User %s accepted legal documents %s", current.id, LEGAL_VERSION)
    return UserPublic.model_validate(current)


# ============================================================================
# POST /api/me/password — смена пароля
# ============================================================================


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(
    payload: PasswordChangeRequest,
    current: User = Depends(get_current_user_any),
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

    current.password_hash = hash_new_password(payload.new_password)
    # Смена пароля отзывает все ранее выданные токены (все другие устройства
    # разлогиниваются). Текущему клиенту нужно перелогиниться.
    current.token_version = (current.token_version or 0) + 1
    await db.commit()

    logger.info("User %s changed own password", current.id)


# ============================================================================
# Смена email с подтверждением по коду (G/SMTP)
# ============================================================================


@router.post("/me/email/request", status_code=status.HTTP_202_ACCEPTED)
async def request_email_change(
    payload: EmailChangeRequest,
    request: Request,
    current: User = Depends(get_current_user_any),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Запросить смену email. Отправляет код подтверждения на НОВЫЙ адрес."""
    import secrets
    from datetime import timedelta

    from sqlalchemy import select

    from app.services.email_service import send_email_change_code

    if not verify_password(payload.password, current.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль")

    # Не даём заваливать чужой ящик письмами со сменой адреса
    allowed, wait = await email_send_limiter.try_acquire(f"emailchange:{current.id}")
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много запросов. Попробуйте через {wait} секунд.",
        )

    new_email = payload.new_email.lower().strip()
    if new_email == (current.email or "").lower():
        raise HTTPException(status_code=400, detail="Это уже ваш текущий email")

    # email не должен быть занят другим пользователем
    exists = await db.scalar(select(User).where(User.email == new_email))
    if exists and exists.id != current.id:
        raise HTTPException(status_code=400, detail="Этот email уже используется")

    code = f"{secrets.randbelow(1000000):06d}"  # 6-значный код
    current.pending_email = new_email
    current.email_change_code = hash_otp(code)
    current.email_change_expires = datetime.now(UTC) + timedelta(minutes=30)
    await db.commit()

    await send_email_change_code(new_email, code)
    logger.info("User %s requested email change to %s", current.id, new_email)
    return {"status": "code_sent", "email": new_email}


@router.post("/me/email/confirm", response_model=UserPublic)
async def confirm_email_change(
    payload: EmailChangeConfirm,
    request: Request,
    current: User = Depends(get_current_user_any),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    """Подтвердить смену email кодом из письма."""
    allowed, wait = await otp_attempt_limiter.try_acquire(f"emailchange:{current.id}")
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток ввода кода. Попробуйте через {wait} секунд.",
        )
    if not current.pending_email or not current.email_change_code:
        raise HTTPException(status_code=400, detail="Нет активного запроса на смену email")

    if current.email_change_expires and datetime.now(UTC) > current.email_change_expires:
        current.pending_email = None
        current.email_change_code = None
        current.email_change_expires = None
        await db.commit()
        raise HTTPException(status_code=400, detail="Срок действия кода истёк. Запросите новый.")

    if not verify_otp(payload.code, current.email_change_code):
        raise HTTPException(status_code=400, detail="Неверный код")

    await otp_attempt_limiter.reset(f"emailchange:{current.id}")
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


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    payload: AccountDeleteRequest,
    current: User = Depends(get_current_user_any),
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
    if current.role == UserRole.ADMIN:
        # Иначе можно случайно остаться без единого администратора.
        raise HTTPException(
            status_code=400,
            detail="Администратор не может удалить свой аккаунт. Сначала передайте права другому.",
        )

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


@router.delete("/me/avatar", response_model=UserPublic)
async def delete_my_avatar(
    current: User = Depends(get_current_user_any),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
) -> UserPublic:
    """Убрать аватар — вместо него показывается первая буква имени. Идемпотентно."""
    key = current.avatar_url
    if not key and not current.avatar_preset:
        return UserPublic.model_validate(current)

    current.avatar_url = None
    current.avatar_preset = None
    await db.commit()
    await db.refresh(current)

    if key:
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


@users_router.get("/{user_id}/avatar", response_model=None)
async def download_user_avatar(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User | None = Depends(get_current_user_optional),
    storage: StorageBackend = Depends(get_storage),
) -> StreamingResponse | FileResponse:
    """Получить аватар пользователя с учётом видимости профиля."""
    user = await db.get(User, user_id)
    if not user or not (user.avatar_url or user.avatar_preset):
        raise HTTPException(status_code=404, detail="Avatar not found")
    if user.profile_visibility == "private" and (
        current is None or current.id != user.id
    ):
        raise HTTPException(status_code=403, detail="Профиль скрыт настройками приватности")

    if user.avatar_preset:
        path = preset_path(user.avatar_preset)
        if path is None:
            raise HTTPException(status_code=404, detail="Avatar not found")
        return FileResponse(
            path,
            media_type="image/svg+xml",
            headers={"Cache-Control": "private, max-age=300"},
        )

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
            "Cache-Control": "private, max-age=300",
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


@router.get("/me/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[LeaderboardEntry]:
    """Рейтинг пользователей по опыту.

    Эндпоинт переехал из /admin: он доступен всем и к администрированию
    отношения не имеет.

    Приватность: тем, кто скрыл профиль, имя не показываем — иначе настройка
    видимости не работает как раз там, где она заметнее всего. Себя человек
    видит всегда: своя позиция в рейтинге должна быть узнаваемой.
    """
    rows = await db.scalars(
        select(User)
        .where(User.is_active.is_(True))
        .order_by(User.xp.desc())
        .limit(limit)
    )

    out: list[LeaderboardEntry] = []
    is_admin = current.role.value == "admin"
    for place, u in enumerate(rows.all(), start=1):
        is_self = u.id == current.id
        hidden = (u.profile_visibility or "public") != "public" and not is_self
        # ФИО видит только администратор (и сам человек); остальным — логин.
        show_name = not hidden and (is_self or is_admin)
        out.append(
            LeaderboardEntry(
                place=place,
                username="" if hidden else u.username,
                full_name=u.full_name if show_name else None,
                xp=u.xp,
                streak_count=u.streak_count,
                is_hidden=hidden,
                is_self=is_self,
            )
        )
    return out


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

    # ФИО видит только администратор (и сам владелец профиля).
    show_name = is_owner or current.role.value == "admin"
    return PublicProfile(
        id=user.id,
        username=user.username,
        full_name=user.full_name if show_name else None,
        department=user.department,
        cyber_level=user.cyber_level,
        xp=user.xp,
        streak_count=user.streak_count,
        has_avatar=bool(user.avatar_url or user.avatar_preset),
        # маскированный email показываем только если профиль публичный
        email_masked=_mask_email(user.email) if user.profile_visibility == "public" else None,
        books_count=books_count,
        quizzes_passed=quizzes_passed,
    )


# ============================================================================
# POST /api/me/usage — обезличенная статистика использования интерфейса
# ============================================================================


@router.post("/me/usage", status_code=status.HTTP_204_NO_CONTENT)
async def report_usage(
    payload: UsageReport,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    """Принять пачку счётчиков из браузера.

    В базе остаются только суммы за день по имени экрана или действия —
    без пользователя. Тема и цвет сохраняются в профиль: по ним в админке
    строится распределение «сколько людей выбрали синий».
    """
    from app.services.usage import record_usage

    await record_usage(db, payload.events)
    if payload.prefs is not None:
        if payload.prefs.theme is not None:
            current.ui_theme = payload.prefs.theme
        if payload.prefs.accent is not None:
            current.ui_accent = payload.prefs.accent
    await db.commit()
