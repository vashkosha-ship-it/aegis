"""Транзакционный журнал административных действий."""

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import get_client_ip
from app.models.admin_log import AdminLog
from app.models.user import User


async def log_admin_action(
    db: AsyncSession,
    admin: User,
    action: str,
    *,
    request: Request,
    target: str | None = None,
    detail: str = "",
    result: str = "success",
) -> None:
    """Добавить audit-запись в ту же транзакцию, что и основное изменение.

    Ошибка не скрывается: успешная операция без обязательного audit trail не
    должна фиксироваться в БД.
    """
    if result not in {"success", "partial", "failure"}:
        raise ValueError("Unsupported admin audit result")
    entry = AdminLog(
        admin_id=admin.id,
        admin_username=admin.username,
        action=action,
        target=target,
        detail=detail,
        result=result,
        request_id=getattr(request.state, "request_id", None),
        ip_address=get_client_ip(request),
    )
    db.add(entry)
    await db.flush()
