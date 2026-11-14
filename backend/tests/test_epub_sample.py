"""scripts/epub_sample: находит фразу, даже если её разбивают теги и переносы."""
import zipfile

from scripts.epub_sample import loose_pattern, sample, visible


def test_pattern_and_visible(tmp_path, capsys):
    assert loose_pattern("Европол").search('<span class="a">Ев</span>\n<span>ро­пол</span>')
    assert visible("сооб­щил x") == "сооб[U+00AD]щил[U+00A0]x"

    path = tmp_path / "b.epub"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("c.opf", "<package><metadata></metadata></package>")
        z.writestr("ch.xhtml", "<html><head></head><body><p>Ев<span>ро</span>пол</p></body></html>")
    sample(str(path), "Европол")
    out = capsys.readouterr().out
    assert "=== Глава: ch.xhtml" in out
    assert "обычная перекладываемая книга" in out
    sample(str(path), "Интерпол")
    assert "не найдена" in capsys.readouterr().out
