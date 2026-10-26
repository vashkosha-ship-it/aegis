"""Приём ошибок из браузера пользователя."""
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field

from app.core.client_ip import get_client_ip
from app.core.rate_limit import client_error_limiter
from app.services.error_reporting import report_client_error

router = APIRouter(tags=["client-errors"])


class ClientErrorReport(BaseModel):
    # kind: error (window.onerror), unhandledrejection, console и т. п.
    kind: str = Field(default="error", max_length=32)
    message: str = Field(default="", max_length=2000)
    stack: str = Field(default="", max_length=8000)
    url: str = Field(default="", max_length=2000)


@router.post("/client-errors", status_code=status.HTTP_204_NO_CONTENT)
async def receive_client_error(payload: ClientErrorReport, request: Request) -> Response:
    """Записать ошибку из браузера в журнал и в сервис ошибок, если он настроен.

    Вход не требуется: ошибка может случиться ещё до него. Поэтому лимит
    по IP, а сверх лимита отчёты молча отбрасываются — клиенту незачем
    повторять отправку.
    """
    allowed, _ = await client_error_limiter.try_acquire(get_client_ip(request))
    if allowed and (payload.message or payload.stack):
        report_client_error(
            message=payload.message,
            stack=payload.stack,
            url=payload.url,
            source=payload.kind,
            user_agent=request.headers.get("user-agent", ""),
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
