"""Authentication endpoints: register, login, refresh, me."""
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_any
from app.core.rate_limit import email_send_limiter, login_limiter, otp_attempt_limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_otp,
    hash_password,
    verify_otp,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.auth import (
    RefreshRequest,
    RegisterResponse,
    ResendCodeRequest,
    TokenPair,
    UserLogin,
    UserPublic,
    UserRegister,
    VerifyEmailRequest,
)
from app.services.email_service import EmailError, send_verification_code

router = APIRouter(prefix="/auth", tags=["auth"])


def _gen_code() -> str:
    """6-значный числовой код."""
    return f"{secrets.randbelow(1000000):06d}"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _guard_email_send(email: str, request: Request) -> None:
    """Не даём заваливать чужой ящик письмами и жечь SMTP-квоту."""
    for key in (f"email:{email.lower().strip()}", f"ip:{_client_ip(request)}"):
        allowed, wait = email_send_limiter.check_allowed(key)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Слишком много запросов. Попробуйте через {wait} секунд.",
            )


def _record_email_send(email: str, request: Request) -> None:
    email_send_limiter.record(f"email:{email.lower().strip()}")
    email_send_limiter.record(f"ip:{_client_ip(request)}")


def _guard_otp_attempt(email: str, request: Request) -> None:
    """6-значный код перебирается за минуты — ограничиваем число проверок."""
    for key in (f"email:{email.lower().strip()}", f"ip:{_client_ip(request)}"):
        allowed, wait = otp_attempt_limiter.check_allowed(key)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Слишком много попыток ввода кода. Попробуйте через {wait} секунд.",
            )
    otp_attempt_limiter.record(f"email:{email.lower().strip()}")
    otp_attempt_limiter.record(f"ip:{_client_ip(request)}")


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """Создать аккаунт читателя. Email обязателен — на него отправляется код подтверждения.
    Аккаунт неактивен до подтверждения email."""
    _guard_email_send(payload.email, request)

    existing = await db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    email_exists = await db.scalar(select(User).where(User.email == payload.email))
    if email_exists:
        raise HTTPException(status_code=400, detail="Email already registered")

    code = _gen_code()
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        department=payload.department,
        role=UserRole.READER,
        is_verified=False,
        verify_code=hash_otp(code),
        verify_expires=datetime.now(UTC) + timedelta(minutes=30),
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    try:
        await send_verification_code(payload.email, code)
        _record_email_send(payload.email, request)
    except EmailError:
        # Письмо не ушло — аккаунт создан, но просим запросить код повторно
        pass

    return RegisterResponse(
        detail="Account created. Verification code sent to email.",
        email=payload.email,
        verification_required=True,
    )


@router.post("/verify", response_model=TokenPair)
async def verify_email(
    payload: VerifyEmailRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Подтвердить email кодом. При успехе аккаунт активируется и выдаются токены."""
    _guard_otp_attempt(payload.email, request)

    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_verified:
        # Уже подтверждён — просто выдаём токены
        return TokenPair(
            access_token=create_access_token(user.id, user.role.value, token_version=user.token_version),
            refresh_token=create_refresh_token(user.id, token_version=user.token_version),
        )
    if not user.verify_code or not user.verify_expires:
        raise HTTPException(status_code=400, detail="No verification pending")
    if datetime.now(UTC) > user.verify_expires:
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")
    if not verify_otp(payload.code, user.verify_code):
        raise HTTPException(status_code=400, detail="Invalid code")

    otp_attempt_limiter.reset(f"email:{payload.email.lower().strip()}")
    user.is_verified = True
    user.verify_code = None
    user.verify_expires = None
    # Сотрудники с корпоративной почтой @sberbank.ru не требуют одобрения админом
    auto_approved = bool(user.email and user.email.lower().strip().endswith("@sberbank.ru"))
    if auto_approved:
        user.is_approved = True
    await db.commit()

    # Уведомляем администратора, что появилась новая заявка на одобрение
    if not user.is_approved:
        try:
            from app.services.email_service import send_admin_new_registration
            await send_admin_new_registration(user.username, user.email, user.full_name)
        except EmailError:
            pass  # письмо админу не критично — не ломаем регистрацию

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value, token_version=user.token_version),
        refresh_token=create_refresh_token(user.id, token_version=user.token_version),
    )


@router.post("/resend-code", status_code=status.HTTP_200_OK)
async def resend_code(
    payload: ResendCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Выслать новый код подтверждения."""
    _guard_email_send(payload.email, request)

    user = await db.scalar(select(User).where(User.email == payload.email))
    # Не раскрываем существование аккаунта
    if not user or user.is_verified:
        return {"detail": "If the account exists and is unverified, a code was sent."}

    code = _gen_code()
    user.verify_code = hash_otp(code)
    user.verify_expires = datetime.now(UTC) + timedelta(minutes=30)
    await db.commit()
    try:
        await send_verification_code(payload.email, code)
        _record_email_send(payload.email, request)
    except EmailError as e:
        raise HTTPException(
            status_code=502, detail="Failed to send email. Try later."
        ) from e
    return {"detail": "Verification code sent."}


@router.post("/login", response_model=TokenPair)
async def login(
    payload: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Authenticate by username + password and return JWT pair."""
    ip = request.client.host if request.client else "unknown"

    # Проверка rate limit
    allowed, remaining = login_limiter.check_allowed(ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {remaining} seconds.",
        )

    user = await db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        login_limiter.record_failure(ip)
        # одинаковое сообщение, чтобы не раскрывать существование пользователя
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")

    login_limiter.record_success(ip)
    return TokenPair(
        access_token=create_access_token(user.id, user.role.value, token_version=user.token_version),
        refresh_token=create_refresh_token(user.id, token_version=user.token_version),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    """Exchange a refresh token for a new access+refresh pair."""
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = int(decoded["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    # Refresh, выданный до смены пароля / выхода со всех устройств, недействителен
    if int(decoded.get("tv", 0)) != user.token_version:
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value, token_version=user.token_version),
        refresh_token=create_refresh_token(user.id, token_version=user.token_version),
    )


@router.get("/me", response_model=UserPublic)
async def me(current: User = Depends(get_current_user_any)) -> UserPublic:
    """Return the currently authenticated user."""
    return UserPublic.model_validate(current)

@router.post("/token", response_model=TokenPair)
async def login_form(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """OAuth2-совместимый логин для Swagger UI и других OAuth2-клиентов."""
    ip = request.client.host if request.client else "unknown"

    allowed, remaining = login_limiter.check_allowed(ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {remaining} seconds.",
        )

    user = await db.scalar(select(User).where(User.username == form.username))
    if not user or not verify_password(form.password, user.password_hash):
        login_limiter.record_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")

    login_limiter.record_success(ip)
    return TokenPair(
        access_token=create_access_token(user.id, user.role.value, token_version=user.token_version),
        refresh_token=create_refresh_token(user.id, token_version=user.token_version),
    )


# ============================================================================
# Восстановление пароля («забыли пароль»)
# ============================================================================
from pydantic import BaseModel, EmailStr, field_validator


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _min_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Пароль должен содержать минимум 8 символов")
        return v


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Запросить код восстановления пароля. Код отправляется на email.

    Из соображений безопасности всегда возвращаем успех, даже если email не найден
    (чтобы нельзя было перебором узнать, какие адреса зарегистрированы).
    """
    _guard_email_send(payload.email, request)

    user = await db.scalar(select(User).where(User.email == payload.email))
    if user:
        code = _gen_code()
        user.reset_code = hash_otp(code)
        user.reset_expires = datetime.now(UTC) + timedelta(minutes=30)
        await db.commit()
        try:
            from app.services.email_service import send_password_reset_code
            await send_password_reset_code(user.email, code)
            _record_email_send(payload.email, request)
        except EmailError:
            pass
    return {"detail": "Если такой email зарегистрирован, на него отправлен код восстановления"}


@router.post("/reset-password", response_model=TokenPair)
async def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Сбросить пароль по коду из письма. При успехе сразу выдаём токены (вход)."""
    _guard_otp_attempt(payload.email, request)

    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.reset_code or not user.reset_expires:
        raise HTTPException(status_code=400, detail="Неверный код или email")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    now = datetime.now(UTC)
    expires = user.reset_expires
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if now > expires:
        raise HTTPException(status_code=400, detail="Код истёк, запросите новый")
    if not verify_otp(payload.code, user.reset_code):
        raise HTTPException(status_code=400, detail="Неверный код")

    otp_attempt_limiter.reset(f"email:{payload.email.lower().strip()}")
    user.password_hash = hash_password(payload.new_password)
    user.reset_code = None
    user.reset_expires = None
    # Сброс пароля отзывает все ранее выданные токены: если аккаунт угнали,
    # у злоумышленника мгновенно пропадает доступ.
    user.token_version = (user.token_version or 0) + 1
    await db.commit()

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value, token_version=user.token_version),
        refresh_token=create_refresh_token(user.id, token_version=user.token_version),
    )