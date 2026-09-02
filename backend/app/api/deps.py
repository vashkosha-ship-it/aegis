"""Common FastAPI dependencies — auth, current user, role checks."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

# TokenError под прежним именем: библиотека сменилась (python-jose → PyJWT),
# но обработчики ниже ловят JWTError, и переименовывать их в той же правке,
# что и замену библиотеки, — лишний риск. Отдельным проходом.
from app.core.security import TokenError as JWTError
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole

# tokenUrl используется только Swagger UI для кнопки "Authorize"
bearer_scheme = HTTPBearer(auto_error=False, description="Вставь сюда access_token, полученный от POST /api/auth/login")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


async def get_current_user_any(
    token: str | None = Depends(oauth2_scheme),
    bearer = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the current user from JWT access token. Raises 401 on failure.

    НЕ проверяет одобрение админом. Использовать только для эндпоинтов, которые
    обязаны работать до одобрения: собственный профиль и онбординг.
    Для всего остального используйте get_current_user.
    """
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
    # Токены, выпущенные до смены пароля / выхода со всех устройств, отзываются
    if int(payload.get("tv", 0)) != user.token_version:
        raise credentials_exc

    # Подтверждение почты проверяем здесь, а не только при входе.
    #
    # Раньше это правило держалось на договорённости: login отказывает
    # неподтверждённым, значит токена у них быть не может. Договорённость уже
    # нарушалась — сброс пароля выдавал токены, не глядя на is_verified.
    # Такие правила надо выражать в коде, а не подразумевать: иначе следующий
    # путь выдачи токена сломает их так же молча.
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified",
        )
    return user


async def get_current_user(current: User = Depends(get_current_user_any)) -> User:
    """Текущий пользователь, одобренный администратором.

    Это зависимость по умолчанию для всех защищённых эндпоинтов: доступ к
    контенту библиотеки закрыт, пока админ не одобрил аккаунт. Админы одобрены
    всегда.
    """
    if current.role == UserRole.ADMIN:
        return current
    if not current.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending admin approval",
        )
    return current


async def get_current_admin(current: User = Depends(get_current_user)) -> User:
    """Like get_current_user but requires admin role."""
    if current.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current


# Оставлено для обратной совместимости: теперь идентично get_current_user.
get_approved_user = get_current_user


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
        if not user or not user.is_active:
            return None
        if int(payload.get("tv", 0)) != user.token_version:
            return None
        if not user.is_verified:
            # Здесь не бросаем: эндпоинт публичный, просто считаем гостем.
            return None
        return user
    except (JWTError, ValueError, TypeError):
        return None