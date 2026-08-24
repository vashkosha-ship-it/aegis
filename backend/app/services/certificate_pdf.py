"""Генерация PDF-сертификата.

Отдельный модуль: вёрстка документа — самостоятельная задача, не связанная
ни с HTTP, ни с логикой экзамена.
"""
from __future__ import annotations

import io
import os
from datetime import datetime


def build_certificate_pdf(full_name: str, category: str, score: int, issued_at: datetime) -> bytes:
    """Генерирует PDF-сертификат с поддержкой кириллицы."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    # Регистрируем кириллический шрифт (DejaVuSans поставляется с системой)
    font_name = "Helvetica"
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
                pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
                font_name = "DejaVu"
                break
            except Exception:
                pass

    bold_font = "DejaVu-Bold" if font_name == "DejaVu" else "Helvetica-Bold"
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    w, h = landscape(A4)

    # Рамка
    c.setStrokeColorRGB(0.18, 0.17, 0.48)
    c.setLineWidth(3)
    c.rect(15 * mm, 15 * mm, w - 30 * mm, h - 30 * mm)
    c.setLineWidth(1)
    c.rect(18 * mm, 18 * mm, w - 36 * mm, h - 36 * mm)

    # Заголовок
    c.setFont(bold_font, 36)
    c.setFillColorRGB(0.18, 0.17, 0.48)
    c.drawCentredString(w / 2, h - 55 * mm, "СЕРТИФИКАТ")

    c.setFont(font_name, 14)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawCentredString(w / 2, h - 68 * mm, "подтверждает, что")

    # ФИО
    c.setFont(bold_font, 26)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.drawCentredString(w / 2, h - 88 * mm, full_name)

    # Текст
    c.setFont(font_name, 14)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawCentredString(w / 2, h - 102 * mm, "успешно прошёл(ла) аттестацию по теме")

    c.setFont(bold_font, 18)
    c.setFillColorRGB(0.18, 0.17, 0.48)
    c.drawCentredString(w / 2, h - 116 * mm, f"«{category}»")

    c.setFont(font_name, 14)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawCentredString(w / 2, h - 130 * mm, f"с результатом {score}%")

    # Дата и подпись
    c.setFont(font_name, 11)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.drawCentredString(w / 2, 32 * mm, f"Дата выдачи: {issued_at.strftime('%d.%m.%Y')}")
    c.drawCentredString(w / 2, 25 * mm, "Aegis Security Library")

    c.showPage()
    c.save()
    return buf.getvalue()