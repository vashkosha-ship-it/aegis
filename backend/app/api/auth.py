"""Authentication endpoints: register, login, refresh, me."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    TokenPair,
    UserLogin,
    UserPublic,
    UserRegister,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)) -> TokenPair:
    """Create a new reader account."""
    existing = await db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    if payload.email:
        email_exists = await db.scalar(select(User).where(User.email == payload.email))
        if email_exists:
            raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        department=payload.department,
        role=UserRole.READER,
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenPair)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenPair:
    """Authenticate by username + password and return JWT pair."""
    user = await db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        # одинаковое сообщение, чтобы не раскрывать существование пользователя
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

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
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """OAuth2-совместимый логин для Swagger UI и других OAuth2-клиентов.

    Принимает application/x-www-form-urlencoded с полями username и password.
    Возвращает тот же TokenPair, что /login. Используй /login для JSON-клиентов
    (фронт), /token — для Swagger и любых OAuth2-инструментов.
    """
    user = await db.scalar(select(User).where(User.username == form.username))
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )
