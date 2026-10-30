"""Описание установленного приложения (web app manifest) с выбранным значком.

Значок установленного приложения система берёт из manifest. Раньше выбор
цвета переключал ссылку на другой файл (manifest-green.json и т. п.), а
Chrome при плановой проверке смотрит тот адрес, что был при установке, и
перемену не замечал. Теперь адрес один, а содержимое зависит от cookie
``aegis_app_icon``, которую ставит страница настроек. Когда Chrome
(Android, компьютер) в очередной раз перепроверит приложение, он увидит
новые картинки и сам заменит значок — не мгновенно, а при своей проверке.
iOS manifest после установки не перечитывает.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import Response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/app", tags=["app"])

ICON_COOKIE = "aegis_app_icon"
_FRONTEND = Path(__file__).resolve().parents[3] / "frontend"
_FILES = {
    "blue": "manifest.json",
    "orange": "manifest-orange.json",
    "green": "manifest-green.json",
    "violet": "manifest-violet.json",
    "red": "manifest-red.json",
    "dark": "manifest-dark.json",
}
# На случай, если файлов фронтенда рядом нет (отдельная раскладка сервера):
# минимальное описание со стандартным значком.
_FALLBACK = {
    "name": "Aegis — центр знаний кибербезопасности",
    "short_name": "Aegis",
    "start_url": "/",
    "scope": "/",
    "id": "/",
    "display": "standalone",
    "background_color": "#0b0b0c",
    "theme_color": "#0b0b0c",
    "icons": [
        {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}


@lru_cache(maxsize=len(_FILES))
def _load(icon: str) -> str:
    path = _FRONTEND / _FILES[icon]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("Manifest %s недоступен, отдаю стандартный", path)
        data = _FALLBACK
    return json.dumps(data, ensure_ascii=False)


@router.get("/manifest.json", include_in_schema=False)
async def app_manifest(request: Request) -> Response:
    icon = request.cookies.get(ICON_COOKIE, "blue")
    if icon not in _FILES:
        icon = "blue"
    return Response(
        content=_load(icon),
        media_type="application/manifest+json",
        headers={
            # Ответ зависит от cookie: кэшировать как общий нельзя.
            "Cache-Control": "no-cache, private",
            "Vary": "Cookie",
        },
    )
