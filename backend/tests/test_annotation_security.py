"""Валидация координат аннотаций, попадающих в CSS frontend."""
import pytest
from pydantic import ValidationError

from app.schemas.library import AnnotationCreate


def _payload(position):
    return {
        "type": "highlight",
        "page": 1,
        "selected_text": "фрагмент",
        "position": position,
    }


@pytest.mark.parametrize(
    "position",
    [
        {"x": '0";background:url(javascript:alert(1))'},
        {"y": -1},
        {"w": 0},
        {"h": 101},
        {"color": '#fff";onmouseover="alert(1)'},
        {"color": "red"},
        {"unexpected": "value"},
    ],
)
def test_annotation_position_rejects_css_injection(position):
    with pytest.raises(ValidationError):
        AnnotationCreate.model_validate(_payload(position))


def test_annotation_position_accepts_bounded_values():
    annotation = AnnotationCreate.model_validate(
        _payload({"x": 12.5, "y": 20, "w": 30, "h": 4, "color": "#fbbf24"})
    )

    assert annotation.position.model_dump() == {
        "x": 12.5,
        "y": 20.0,
        "w": 30.0,
        "h": 4.0,
        "color": "#fbbf24",
    }
