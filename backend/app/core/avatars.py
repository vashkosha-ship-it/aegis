"""Готовый набор аватаров.

Картинки лежат в app/static/avatars/<id>.svg и отдаются по тому же адресу,
что раньше загруженные фото, поэтому аватар виден везде без доработок
клиента. Загружать свои изображения пользователи больше не могут.
"""
from pathlib import Path

AVATAR_DIR = Path(__file__).resolve().parent.parent / "static" / "avatars"
AVATAR_PRESETS: tuple[str, ...] = tuple(f"a{i:02d}" for i in range(1, 16))


def preset_path(preset_id: str) -> Path | None:
    """Путь к SVG набора или None, если такого аватара нет."""
    if preset_id not in AVATAR_PRESETS:
        return None
    path = AVATAR_DIR / f"{preset_id}.svg"
    return path if path.is_file() else None


def has_avatar(user) -> bool:
    return bool(getattr(user, "avatar_preset", None) or getattr(user, "avatar_url", None))
