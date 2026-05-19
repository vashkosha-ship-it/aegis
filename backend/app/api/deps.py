"""Common FastAPI dependencies — auth, current user, role checks."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole

# tokenUrl используется только Swagger UI для кнопки "Authorize"
bearer_scheme = HTTPBearer(auto_error=False, description="Вставь сюда access_token, полученный от POST /api/auth/login")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    bearer = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the current user from JWT access token. Raises 401 on failure."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Поддерживаем две схемы: oauth2_scheme (форма Swagger) и HTTPBearer (ручной токен)
    if not token and bearer:
        token = bearer.credentials
    if not token:
        raise credentials_exc

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exc
        subject = payload.get("sub")
        if subject is None:
            raise credentials_exc
        user_id = int(subject)
    except (JWTError, ValueError):
        raise credentials_exc from None

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_exc
    return user


async def get_current_admin(current: User = Depends(get_current_user)) -> User:
    """Like get_current_user but requires admin role."""
    if current.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current


async def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme),
    bearer = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Returns current user if authenticated, None otherwise. For public endpoints with bonus data."""
    if not token and bearer:
        token = bearer.credentials
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = int(payload.get("sub"))
        user = await db.get(User, user_id)
        return user if (user and user.is_active) else None
    except (JWTError, ValueError, TypeError):
        return None
