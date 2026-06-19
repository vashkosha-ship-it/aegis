"""Authentication endpoints: register, login, refresh, me."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Request
from app.core.rate_limit import login_limiter

from app.api.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
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
from app.services.email_service import send_verification_code, EmailError
import secrets
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/auth", tags=["auth"])


def _gen_code() -> str:
    """6-значный числовой код."""
    return f"{secrets.randbelow(1000000):06d}"


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)) -> RegisterResponse:
    """Создать аккаунт читателя. Email обязателен — на него отправляется код подтверждения.
    Аккаунт неактивен до подтверждения email."""
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
        verify_code=code,
        verify_expires=datetime.now(timezone.utc) + timedelta(minutes=30),
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    try:
        await send_verification_code(payload.email, code)
    except EmailError:
        # Письмо не ушло — аккаунт создан, но просим запросить код повторно
        pass

    return RegisterResponse(
        detail="Account created. Verification code sent to email.",
        email=payload.email,
        verification_required=True,
    )


@router.post("/verify", response_model=TokenPair)
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    """Подтвердить email кодом. При успехе аккаунт активируется и выдаются токены."""
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_verified:
        # Уже подтверждён — просто выдаём токены
        return TokenPair(
            access_token=create_access_token(user.id, user.role.value),
            refresh_token=create_refresh_token(user.id),
        )
    if not user.verify_code or not user.verify_expires:
        raise HTTPException(status_code=400, detail="No verification pending")
    if datetime.now(timezone.utc) > user.verify_expires:
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")
    if payload.code.strip() != user.verify_code:
        raise HTTPException(status_code=400, detail="Invalid code")

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
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/resend-code", status_code=status.HTTP_200_OK)
async def resend_code(payload: ResendCodeRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Выслать новый код подтверждения."""
    user = await db.scalar(select(User).where(User.email == payload.email))
    # Не раскрываем существование аккаунта
    if not user or user.is_verified:
        return {"detail": "If the account exists and is unverified, a code was sent."}

    code = _gen_code()
    user.verify_code = code
    user.verify_expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    await db.commit()
    try:
        await send_verification_code(payload.email, code)
    except EmailError:
        raise HTTPException(status_code=502, detail="Failed to send email. Try later.")
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
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
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

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserPublic)
async def me(current: User = Depends(get_current_user)) -> UserPublic:
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

    login_limiter.record_success(ip)
    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )