"""Email-уведомление об окончательном падении systemd-сервиса Aegis."""
from __future__ import annotations

import asyncio
import logging
import os
import re
import socket
import sys
import time
from pathlib import Path

from app.core.config import settings
from app.services.email_service import EmailError, send_email

logger = logging.getLogger("aegis.service_alert")
_ALLOWED_UNIT = re.compile(r"^aegis(?:-worker|-backup)?\.service$")
_THROTTLE_SECONDS = 15 * 60
_STATE_DIR = Path(os.environ.get("AEGIS_ALERT_STATE_DIR", "/run/aegis-alerts"))


def _should_send(unit: str, now: float | None = None) -> bool:
    """Не отправлять повторное письмо о том же сервисе чаще 15 минут."""
    current = time.time() if now is None else now
    _STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    marker = _STATE_DIR / unit
    try:
        previous = float(marker.read_text(encoding="ascii"))
    except (FileNotFoundError, ValueError, OSError):
        previous = 0
    if current - previous < _THROTTLE_SECONDS:
        return False
    marker.write_text(str(current), encoding="ascii")
    return True


async def notify(unit: str) -> int:
    if not _ALLOWED_UNIT.fullmatch(unit):
        logger.error("Недопустимое имя systemd unit: %r", unit)
        return 2

    recipient = settings.ADMIN_NOTIFY_EMAIL.strip()
    if not recipient:
        logger.error("ADMIN_NOTIFY_EMAIL не задан; уведомление о %s не отправлено", unit)
        return 1
    if not _should_send(unit):
        logger.warning("Повторное уведомление о %s подавлено на 15 минут", unit)
        return 0

    host = socket.gethostname()
    finished = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    subject = f"Aegis ALERT — упал {unit} на {host}"
    body = (
        f"Сервис: {unit}\n"
        f"Сервер: {host}\n"
        f"Время: {finished}\n\n"
        f"Проверка:\n"
        f"systemctl status {unit} --no-pager -l\n"
        f"journalctl -u {unit} -n 100 --no-pager\n"
    )
    try:
        await send_email(recipient, subject, body)
    except EmailError:
        logger.exception("Не удалось доставить уведомление о %s", unit)
        return 1
    return 0


def main() -> int:
    if len(sys.argv) != 2:
        logger.error("Использование: python -m app.service_alert UNIT")
        return 2
    return asyncio.run(notify(sys.argv[1]))


if __name__ == "__main__":
    raise SystemExit(main())
