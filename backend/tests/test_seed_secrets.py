"""Seed не должен содержать паролей и запускаться на боевом сервере сам.

Раньше пароль администратора был зашит в код («admin123») и печатался в
консоль при каждом запуске: он оседал в логах деплоя, в истории терминала и в
выводе CI. Пароль по умолчанию, известный всем, кто видел репозиторий, паролем
не является.

Отдельно проверяется, что скрипт не запустится в production без явного
разрешения: он создаёт демонстрационные книги и учебного аккаунта, и случайный
запуск на боевом сервере оставил бы и то, и другое.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

from scripts import seed as seed_module

SEED_PATH = Path(seed_module.__file__)
SEED_SOURCE = SEED_PATH.read_text(encoding="utf-8")


def _code_string_literals(source: str) -> list[str]:
    """Строковые литералы из кода, без докстрингов.

    Смотреть на весь текст файла нельзя: тогда проверка сработает на
    упоминании пароля в комментарии, объясняющем, почему его здесь больше нет.
    """
    tree = ast.parse(source)
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(
            node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
        ):
            doc = ast.get_docstring(node, clean=False)
            if doc is not None:
                docstrings.add(doc)

    return [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and node.value not in docstrings
    ]


class TestNoHardcodedSecrets:
    @pytest.mark.parametrize(
        "leaked", ["admin123", "user1234", "changeme", "password123"]
    )
    def test_known_default_passwords_absent(self, leaked):
        literals = _code_string_literals(SEED_SOURCE)
        offenders = [s for s in literals if leaked in s]
        assert not offenders, (
            f"в seed.py остался пароль по умолчанию {leaked!r}: {offenders}"
        )

    def test_password_comes_from_environment(self):
        assert "SEED_ADMIN_PASSWORD" in SEED_SOURCE

    def test_hash_password_never_called_with_literal(self):
        """hash_password('что-то') означает пароль, вшитый в код."""
        literal_calls = re.findall(r"hash_password\(\s*[\"']", SEED_SOURCE)
        assert not literal_calls, "hash_password вызывается со строковым литералом"

    def test_password_is_not_printed(self):
        """Вывод скрипта попадает в логи деплоя и историю терминала."""
        for line in SEED_SOURCE.splitlines():
            if "print(" in line and "password" in line.lower():
                assert "=" not in line.split("print(")[1] or "username=" in line, (
                    f"пароль может попасть в вывод: {line.strip()}"
                )


class TestEnvironmentGuard:
    def test_production_refuses_without_flag(self, monkeypatch):
        monkeypatch.setattr(seed_module.settings, "DEBUG", False)
        with pytest.raises(seed_module.SeedRefused, match="production"):
            seed_module._check_environment(allow_production=False)

    def test_production_allowed_with_flag(self, monkeypatch):
        monkeypatch.setattr(seed_module.settings, "DEBUG", False)
        assert seed_module._check_environment(allow_production=True) is True

    def test_development_runs_freely(self, monkeypatch):
        monkeypatch.setattr(seed_module.settings, "DEBUG", True)
        assert seed_module._check_environment(allow_production=False) is False


class TestPasswordRequirements:
    def test_missing_env_var_refused(self, monkeypatch):
        monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)
        with pytest.raises(seed_module.SeedRefused, match="SEED_ADMIN_PASSWORD"):
            seed_module._read_admin_password(production=False)

    def test_empty_env_var_refused(self, monkeypatch):
        monkeypatch.setenv("SEED_ADMIN_PASSWORD", "")
        with pytest.raises(seed_module.SeedRefused, match="SEED_ADMIN_PASSWORD"):
            seed_module._read_admin_password(production=False)

    def test_short_password_refused_in_production(self, monkeypatch):
        monkeypatch.setenv("SEED_ADMIN_PASSWORD", "short123")
        with pytest.raises(seed_module.SeedRefused, match="короче"):
            seed_module._read_admin_password(production=True)

    def test_long_password_accepted_in_production(self, monkeypatch):
        password = "a-quite-long-passphrase-2026"
        monkeypatch.setenv("SEED_ADMIN_PASSWORD", password)
        assert seed_module._read_admin_password(production=True) == password

    def test_shorter_password_ok_in_development(self, monkeypatch):
        monkeypatch.setenv("SEED_ADMIN_PASSWORD", "devpass1")
        assert seed_module._read_admin_password(production=False) == "devpass1"
