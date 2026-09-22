"""E2E seed никогда не должен коснуться production."""

import pytest

from scripts import seed_e2e


def test_e2e_seed_requires_explicit_local_ci_marker(monkeypatch):
    monkeypatch.delenv("AEGIS_E2E_SEED", raising=False)
    with pytest.raises(RuntimeError, match="AEGIS_E2E_SEED"):
        seed_e2e._guard_local_ci()


def test_e2e_seed_refuses_production_even_with_marker(monkeypatch):
    monkeypatch.setenv("AEGIS_E2E_SEED", "local-ci-only")
    monkeypatch.setattr(seed_e2e.settings, "DEBUG", False)
    with pytest.raises(RuntimeError, match="DEBUG=false"):
        seed_e2e._guard_local_ci()
