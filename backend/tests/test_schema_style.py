"""Защёлки против возврата устаревших конструкций Pydantic v1."""

from pathlib import Path


def test_schemas_do_not_use_class_based_config():
    schemas_dir = Path(__file__).parents[1] / "app" / "schemas"
    offenders = [
        path.name
        for path in schemas_dir.glob("*.py")
        if "class Config:" in path.read_text(encoding="utf-8")
    ]

    assert not offenders, (
        "Используйте model_config = ConfigDict(...), "
        "устаревший class Config найден в: "
        + ", ".join(offenders)
    )
