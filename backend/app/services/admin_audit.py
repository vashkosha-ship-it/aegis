"""Запись действий администратора в журнал (admin_logs)."""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_log import AdminLog
from app.models.user import User

logger = logging.getLogger(__name__)


async def log_admin_action(
    db: AsyncSession,
    admin: User,
    action: str,
    *,
    target: str | None = None,
    detail: str = "",
) -> None:
    """Записать действие админа. Не бросает исключений — аудит не должен ломать основную операцию."""
    try:
        entry = AdminLog(
            admin_id=admin.id,
            admin_username=admin.username,
            action=action,
            target=target,
            detail=detail,
        )
        db.add(entry)
        # коммит делает вызывающая сторона вместе со своей транзакцией;
        # но если её нет — флашим, чтобы запись не потерялась
        await db.flush()
    except Exception:  # noqa: BLE001
        logger.exception("Не удалось записать admin-log (action=%s)", action)
