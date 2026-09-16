"""Безопасно скопировать локальные файлы Aegis в S3-совместимое хранилище.

Скрипт не меняет базу: логические ключи объектов сохраняются. По умолчанию
он выполняет только сверку и показывает план; запись включается --execute.
Локальные файлы намеренно не удаляются — они остаются страховкой до ручной
проверки production после переключения STORAGE_BACKEND=s3.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.core.storage import LocalStorage, S3Storage
from app.services.storage_integrity import MANAGED_PREFIXES


@dataclass(frozen=True, slots=True)
class MigrationPlan:
    upload: tuple[tuple[str, int], ...]
    unchanged: tuple[tuple[str, int], ...]
    conflicts: tuple[tuple[str, int, int], ...]

    @property
    def upload_bytes(self) -> int:
        return sum(size for _, size in self.upload)


def _format_bytes(value: int) -> str:
    size = float(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if size < 1024 or unit == "TiB":
            return f"{size:.1f} {unit}"
        size /= 1024
    raise AssertionError("unreachable")


async def build_plan(local: LocalStorage, target: S3Storage) -> MigrationPlan:
    upload: list[tuple[str, int]] = []
    unchanged: list[tuple[str, int]] = []
    conflicts: list[tuple[str, int, int]] = []
    for item in await local.list_objects(MANAGED_PREFIXES):
        if not await target.exists(item.key):
            upload.append((item.key, item.size_bytes))
            continue
        remote_size = await target.size(item.key)
        if remote_size == item.size_bytes:
            unchanged.append((item.key, item.size_bytes))
        else:
            conflicts.append((item.key, item.size_bytes, remote_size))
    return MigrationPlan(tuple(upload), tuple(unchanged), tuple(conflicts))


async def execute_plan(
    local: LocalStorage,
    target: S3Storage,
    plan: MigrationPlan,
    *,
    overwrite: bool,
) -> None:
    if plan.conflicts and not overwrite:
        raise RuntimeError(
            "В S3 есть ключи другого размера; проверьте список и повторите "
            "с --overwrite только если замена ожидаема"
        )

    pending = list(plan.upload)
    if overwrite:
        pending.extend((key, local_size) for key, local_size, _ in plan.conflicts)

    total = len(pending)
    for index, (key, expected_size) in enumerate(pending, start=1):
        chunks = await local.open_stream(key)
        saved = await target.save_stream(key, chunks, max_bytes=expected_size)
        remote_size = await target.size(key)
        if saved != expected_size or remote_size != expected_size:
            await target.delete(key)
            raise RuntimeError(
                f"Проверка размера не прошла для {key}: "
                f"local={expected_size}, uploaded={saved}, remote={remote_size}"
            )
        print(f"[{index}/{total}] {key} ({_format_bytes(expected_size)})")


def _target() -> S3Storage:
    return S3Storage(
        bucket=settings.S3_BUCKET_BOOKS,
        prefix=settings.S3_KEY_PREFIX,
    )


async def _run(args: argparse.Namespace) -> int:
    root = Path(args.local_path or settings.STORAGE_LOCAL_PATH)
    if not root.is_dir():
        raise RuntimeError(f"Локальное хранилище не найдено: {root}")
    local = LocalStorage(root)
    target = _target()
    plan = await build_plan(local, target)

    print(f"Локальное хранилище: {root.resolve()}")
    print(
        f"S3: bucket={target.bucket}, prefix={target.prefix or '(нет)'}, "
        f"загрузить={len(plan.upload)} ({_format_bytes(plan.upload_bytes)}), "
        f"уже совпадают={len(plan.unchanged)}, конфликты={len(plan.conflicts)}"
    )
    for key, local_size, remote_size in plan.conflicts:
        print(
            f"CONFLICT {key}: local={_format_bytes(local_size)}, "
            f"S3={_format_bytes(remote_size)}"
        )

    if not args.execute:
        print("Проверка завершена без изменений. Для копирования добавьте --execute.")
        return 2 if plan.conflicts else 0

    await target.check_writable()
    await execute_plan(local, target, plan, overwrite=args.overwrite)

    verified = await build_plan(local, target)
    if verified.upload or verified.conflicts:
        raise RuntimeError(
            f"Итоговая сверка не пройдена: отсутствуют={len(verified.upload)}, "
            f"конфликты={len(verified.conflicts)}"
        )
    print(
        f"Готово: {len(verified.unchanged)} объектов сверены по ключу и размеру. "
        "Локальные файлы сохранены."
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local-path", help="Путь к локальному storage")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Действительно загрузить отсутствующие объекты",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Заменить объекты с совпадающим ключом, но другим размером",
    )
    args = parser.parse_args()
    if args.overwrite and not args.execute:
        parser.error("--overwrite требует --execute")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
