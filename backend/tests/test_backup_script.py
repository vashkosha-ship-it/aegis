"""Интеграционная проверка backup-скрипта без настоящего PostgreSQL."""
from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "backend" / "deploy" / "backup.sh"


def test_backup_is_complete_and_checksummed(tmp_path):
    storage = tmp_path / "storage"
    storage.mkdir()
    (storage / "book.pdf").write_bytes(b"test-pdf")

    backup_dir = tmp_path / "backups"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_pg_dump = fake_bin / "pg_dump"
    fake_pg_dump.write_text(
        "#!/usr/bin/env python3\n"
        "import pathlib, sys\n"
        "target = next(a.split('=', 1)[1] for a in sys.argv if a.startswith('--file='))\n"
        "pathlib.Path(target).write_bytes(b'test-dump')\n",
        encoding="utf-8",
    )
    fake_pg_dump.chmod(0o700)

    env = os.environ | {
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "DATABASE_URL_SYNC": "postgresql+psycopg2://user:pass@db/test",
        "STORAGE_BACKEND": "local",
        "STORAGE_LOCAL_PATH": str(storage),
        "AEGIS_BACKUP_DIR": str(backup_dir),
        "AEGIS_BACKUP_KEEP_DAYS": "14",
    }
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )

    completed = [path for path in backup_dir.iterdir() if not path.name.startswith(".")]
    assert len(completed) == 1
    backup = completed[0]
    assert str(backup) in result.stdout
    assert not list(backup_dir.glob(".incomplete-*"))
    assert (backup / "database.dump").read_bytes() == b"test-dump"
    assert (backup / "storage.tar.gz").is_file()

    sums = {}
    for line in (backup / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        digest, filename = line.split(maxsplit=1)
        sums[filename] = digest
    for filename in ("database.dump", "storage.tar.gz"):
        actual = hashlib.sha256((backup / filename).read_bytes()).hexdigest()
        assert sums[filename] == actual


def test_backup_refuses_partial_s3_copy(tmp_path):
    env = os.environ | {
        "DATABASE_URL_SYNC": "postgresql+psycopg2://user:pass@db/test",
        "STORAGE_BACKEND": "s3",
        "AEGIS_BACKUP_DIR": str(tmp_path / "backups"),
    }
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode == 2
    assert "refusing partial backup" in result.stderr
