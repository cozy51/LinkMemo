from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "LinkMemo_Chrome_Edge_Manual.pdf"
TOTAL_PAGES = 10

PAGE_W, PAGE_H = A4
MARGIN = 42

FONT_REGULAR = "YuGothic"
FONT_BOLD = "YuGothicBold"

INK = HexColor("#18233C")
MUTED = HexColor("#6E7890")
LIGHT_MUTED = HexColor("#8E98AB")
LINE = HexColor("#E3E8F1")
CANVAS = HexColor("#F5F7FB")
PANEL = white
BLUE = HexColor("#4969ED")
BLUE_DARK = HexColor("#3552CF")
BLUE_SOFT = HexColor("#EAF0FF")
PURPLE = HexColor("#8057CF")
PURPLE_SOFT = HexColor("#F3EFFC")
GREEN = HexColor("#278966")
GREEN_SOFT = HexColor("#EAF7F2")
ORANGE = HexColor("#C87525")
ORANGE_SOFT = HexColor("#FFF3E7")
RED = HexColor("#C23751")
RED_SOFT = HexColor("#FFF0F3")
LINK_BLUE = HexColor("#315BA5")
LINK_SOFT = HexColor("#EAF0FB")


def register_fonts():
    pdfmetrics.registerFont(
        TTFont(FONT_REGULAR, r"C:\Windows\Fonts\YuGothR.ttc", subfontIndex=0)
    )
    pdfmetrics.registerFont(
        TTFont(FONT_BOLD, r"C:\Windows\Fonts\YuGothB.ttc", subfontIndex=0)
    )


def set_font(c, size, bold=False, color=INK):
    c.setFont(FONT_BOLD if bold else FONT_REGULAR, size)
    c.setFillColor(color)


def rounded_panel(c, x, y, w, h, fill=PANEL, stroke=LINE, radius=12, width=0.8):
    c.setLineWidth(width)
    c.setStrokeColor(stroke)
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)


def pill(c, x, y, text, fill=BLUE_SOFT, color=BLUE, size=7.5, pad_x=8, h=18):
    set_font(c, size, bold=True, color=color)
    w = pdfmetrics.stringWidth(text, FONT_BOLD, size) + pad_x * 2
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, h / 2, stroke=0, fill=1)
    set_font(c, size, bold=True, color=color)
    c.drawString(x + pad_x, y + (h - size) / 2 + 1, text)
    return w


def wrap_lines(text, font_name, size, max_width):
    lines = []
    current = ""
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            candidate = current + char
            if current and pdfmetrics.stringWidth(candidate, font_name, size) > max_width:
                lines.append(current)
                current = char
            else:
                current = candidate
        if current:
            lines.append(current)
    return lines


def draw_wrapped(c, text, x, y, max_width, size=9.5, leading=15, color=MUTED, bold=False, max_lines=None):
    font_name = FONT_BOLD if bold else FONT_REGULAR
    lines = wrap_lines(text, font_name, size, max_width)
    if max_lines is not None:
        lines = lines[:max_lines]
    set_font(c, size, bold=bold, color=color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_centered_wrapped(c, text, center_x, y, max_width, size=9, leading=14, color=MUTED, bold=False):
    font_name = FONT_BOLD if bold else FONT_REGULAR
    lines = wrap_lines(text, font_name, size, max_width)
    set_font(c, size, bold=bold, color=color)
    for line in lines:
        c.drawCentredString(center_x, y, line)
        y -= leading
    return y


def draw_header(c, section, page):
    set_font(c, 8, bold=True, color=BLUE)
    c.drawString(MARGIN, PAGE_H - 30, "LINKMEMO")
    set_font(c, 8, color=MUTED)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 30, section)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(MARGIN, PAGE_H - 39, PAGE_W - MARGIN, PAGE_H - 39)
    draw_footer(c, page)


def draw_footer(c, page):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, 31, PAGE_W - MARGIN, 31)
    set_font(c, 7.5, color=LIGHT_MUTED)
    c.drawString(MARGIN, 18, "LinkMemo Chrome / Edge 利用マニュアル  |  Version 1.1.0")
    c.drawRightString(PAGE_W - MARGIN, 18, f"{page} / {TOTAL_PAGES}")


def draw_page_title(c, kicker, title, subtitle, y=752):
    set_font(c, 8, bold=True, color=BLUE)
    c.drawString(MARGIN, y, kicker)
    set_font(c, 25, bold=True, color=INK)
    c.drawString(MARGIN, y - 34, title)
    draw_wrapped(c, subtitle, MARGIN, y - 58, PAGE_W - MARGIN * 2, size=9.5, leading=15)


def draw_number(c, x, y, number, color=BLUE, radius=14):
    c.setFillColor(color)
    c.circle(x, y, radius, stroke=0, fill=1)
    set_font(c, 10, bold=True, color=white)
    c.drawCentredString(x, y - 3.5, str(number))


def draw_action_icon(c, center_x, center_y, symbol, color, size=9):
    if symbol == "edit":
        c.setStrokeColor(color)
        c.setLineWidth(1.5)
        c.line(center_x - 4.5, center_y - 4.5, center_x + 3.5, center_y + 3.5)
        c.line(center_x - 2.5, center_y - 6.5, center_x + 5.5, center_y + 1.5)
        c.line(center_x + 3.5, center_y + 3.5, center_x + 5.5, center_y + 1.5)
        c.setFillColor(color)
        c.circle(center_x - 3.5, center_y - 5.5, 1.1, stroke=0, fill=1)
        return
    set_font(c, size, bold=True, color=color)
    c.drawCentredString(center_x, center_y - size * 0.34, symbol)


def draw_step_row(c, number, title, body, y, accent=BLUE, tag=None):
    x = MARGIN
    w = PAGE_W - MARGIN * 2
    h = 72
    rounded_panel(c, x, y, w, h, fill=PANEL, stroke=LINE, radius=12)
    draw_number(c, x + 27, y + h / 2, number, accent, radius=14)
    set_font(c, 11.5, bold=True, color=INK)
    c.drawString(x + 53, y + h - 24, title)
    draw_wrapped(c, body, x + 53, y + h - 42, w - 80, size=8.6, leading=12.5, color=MUTED, max_lines=2)
    if tag:
        tag_w = pdfmetrics.stringWidth(tag, FONT_BOLD, 7.2) + 16
        pill(c, x + w - tag_w - 12, y + h - 25, tag, fill=BLUE_SOFT, color=accent, size=7.2)


def draw_callout(c, x, y, w, h, title, body, kind="info"):
    palette = {
        "info": (BLUE, BLUE_SOFT),
        "success": (GREEN, GREEN_SOFT),
        "warning": (ORANGE, ORANGE_SOFT),
        "danger": (RED, RED_SOFT),
    }
    accent, soft = palette[kind]
    rounded_panel(c, x, y, w, h, fill=soft, stroke=soft, radius=11)
    c.setFillColor(accent)
    c.roundRect(x, y, 5, h, 2.5, stroke=0, fill=1)
    set_font(c, 9.5, bold=True, color=accent)
    c.drawString(x + 16, y + h - 21, title)
    draw_wrapped(c, body, x + 16, y + h - 39, w - 30, size=8.4, leading=12, color=INK)


def draw_browser_bar(c, x, y, w, title, scheme="chrome"):
    h = 42
    c.setFillColor(HexColor("#F1F3F6"))
    c.roundRect(x, y, w, h, 9, stroke=0, fill=1)
    colors = (
        [HexColor("#EA4335"), HexColor("#FBBC04"), HexColor("#34A853")]
        if scheme == "chrome"
        else [HexColor("#5C6BC0"), HexColor("#4E8ED7"), HexColor("#45B4A5")]
    )
    for i, color in enumerate(colors):
        c.setFillColor(color)
        c.circle(x + 14 + i * 12, y + 29, 3, stroke=0, fill=1)
    c.setFillColor(white)
    c.roundRect(x + 48, y + 8, w - 60, 24, 8, stroke=0, fill=1)
    set_font(c, 7.5, color=MUTED)
    c.drawString(x + 58, y + 16, title)


def draw_extension_page_mock(c, x, y, w, h, browser="Chrome"):
    rounded_panel(c, x, y, w, h, fill=white, stroke=LINE, radius=13)
    draw_browser_bar(c, x + 1, y + h - 43, w - 2, f"{browser.lower()}://extensions/", browser.lower())
    set_font(c, 10, bold=True)
    c.drawString(x + 16, y + h - 67, "拡張機能")
    c.setFillColor(BLUE)
    c.roundRect(x + w - 117, y + h - 76, 100, 23, 7, stroke=0, fill=1)
    set_font(c, 7.3, bold=True, color=white)
    c.drawCentredString(x + w - 67, y + h - 68, "開発者モード ON")
    rounded_panel(c, x + 16, y + 18, w - 32, h - 106, fill=CANVAS, stroke=LINE, radius=9)
    c.setFillColor(BLUE)
    c.roundRect(x + 27, y + h - 111, 107, 25, 7, stroke=0, fill=1)
    set_font(c, 7.2, bold=True, color=white)
    label = "展開して読み込み" if browser == "Edge" else "未パッケージを読み込む"
    c.drawCentredString(x + 80.5, y + h - 103, label)
    rounded_panel(c, x + 27, y + 30, w - 54, h - 156, fill=white, stroke=LINE, radius=9)
    c.setFillColor(BLUE)
    c.roundRect(x + 39, y + h - 153, 34, 34, 10, stroke=0, fill=1)
    set_font(c, 13, bold=True, color=white)
    c.drawCentredString(x + 56, y + h - 143, "L")
    set_font(c, 9.5, bold=True)
    c.drawString(x + 82, y + h - 134, "LinkMemo - 仕事スタート")
    set_font(c, 7.2, color=MUTED)
    c.drawString(x + 82, y + h - 148, "有効  |  Version 1.1.0")


def draw_popup_mock(c, x, y, w, h, show_quick_add=False):
    rounded_panel(c, x, y, w, h, fill=CANVAS, stroke=LINE, radius=15)
    c.setFillColor(white)
    c.roundRect(x + 1, y + h - 48, w - 2, 47, 14, stroke=0, fill=1)
    c.setFillColor(BLUE)
    c.roundRect(x + 13, y + h - 39, 28, 28, 9, stroke=0, fill=1)
    set_font(c, 11, bold=True, color=white)
    c.drawCentredString(x + 27, y + h - 30, "L")
    set_font(c, 11, bold=True)
    c.drawString(x + 49, y + h - 27, "LinkMemo")
    set_font(c, 6, color=LIGHT_MUTED)
    c.drawString(x + 49, y + h - 38, "WORK LAUNCHER")
    c.setFillColor(HexColor("#EEF1F6"))
    c.roundRect(x + w - 40, y + h - 38, 27, 27, 8, stroke=0, fill=1)
    set_font(c, 11, bold=True, color=MUTED)
    c.drawCentredString(x + w - 26.5, y + h - 30, "*")

    rounded_panel(c, x + 12, y + h - 101, w - 24, 42, fill=white, stroke=LINE, radius=10)
    set_font(c, 13, bold=True)
    c.drawString(x + 25, y + h - 79, "2")
    set_font(c, 6.5, color=MUTED)
    c.drawString(x + 25, y + h - 90, "グループ")
    set_font(c, 13, bold=True)
    c.drawString(x + 78, y + h - 79, "5")
    set_font(c, 6.5, color=MUTED)
    c.drawString(x + 78, y + h - 90, "リンク")
    c.setFillColor(BLUE)
    c.roundRect(x + w - 99, y + h - 91, 75, 26, 8, stroke=0, fill=1)
    set_font(c, 7.3, bold=True, color=white)
    c.drawCentredString(x + w - 61.5, y + h - 82, "すべて開く")

    set_font(c, 6.5, bold=True, color=LIGHT_MUTED)
    c.drawString(x + 14, y + h - 124, "MY GROUPS")
    set_font(c, 11.5, bold=True)
    c.drawString(x + 14, y + h - 140, "登録グループ")
    set_font(c, 7.2, bold=True, color=BLUE)
    c.drawRightString(x + w - 14, y + h - 139, "+ 現在のタブ")

    group_y = y + h - 278
    draw_popup_group(c, x + 11, group_y, w - 22, 126, "毎朝開く", "4件のリンク", BLUE, BLUE_SOFT, ["Outlook", "Microsoft Teams"])
    group_y2 = y + 18
    draw_popup_group(c, x + 11, group_y2, w - 22, 94, "プロジェクト", "1件のリンク", PURPLE, PURPLE_SOFT, ["プロジェクト管理"])

    if show_quick_add:
        c.setFillColor(Color(0.08, 0.12, 0.23, alpha=0.46))
        c.roundRect(x, y, w, h, 15, stroke=0, fill=1)
        dialog_w = w - 36
        dialog_h = 180
        dialog_x = x + 18
        dialog_y = y + (h - dialog_h) / 2
        rounded_panel(c, dialog_x, dialog_y, dialog_w, dialog_h, fill=white, stroke=LINE, radius=13)
        set_font(c, 6.3, bold=True, color=BLUE)
        c.drawString(dialog_x + 15, dialog_y + dialog_h - 20, "QUICK ADD")
        set_font(c, 11.5, bold=True)
        c.drawString(dialog_x + 15, dialog_y + dialog_h - 37, "現在のタブを追加")
        set_font(c, 7, bold=True, color=MUTED)
        c.drawString(dialog_x + 15, dialog_y + 104, "追加先グループ")
        rounded_panel(c, dialog_x + 15, dialog_y + 69, dialog_w - 30, 29, fill=white, stroke=BLUE, radius=7)
        set_font(c, 8, bold=True)
        c.drawString(dialog_x + 25, dialog_y + 79, "毎朝開く")
        set_font(c, 7, color=MUTED)
        c.drawRightString(dialog_x + dialog_w - 25, dialog_y + 79, "v")
        c.setFillColor(HexColor("#EEF1F6"))
        c.roundRect(dialog_x + dialog_w - 145, dialog_y + 20, 60, 28, 8, stroke=0, fill=1)
        set_font(c, 7.5, bold=True, color=MUTED)
        c.drawCentredString(dialog_x + dialog_w - 115, dialog_y + 29, "キャンセル")
        c.setFillColor(BLUE)
        c.roundRect(dialog_x + dialog_w - 77, dialog_y + 20, 62, 28, 8, stroke=0, fill=1)
        set_font(c, 7.5, bold=True, color=white)
        c.drawCentredString(dialog_x + dialog_w - 46, dialog_y + 29, "追加する")


def draw_popup_group(c, x, y, w, h, name, count, accent, soft, links):
    rounded_panel(c, x, y, w, h, fill=white, stroke=LINE, radius=11)
    c.setFillColor(accent)
    c.roundRect(x, y, 4, h, 2, stroke=0, fill=1)
    c.setFillColor(soft)
    c.roundRect(x + 4, y + h - 45, w - 4, 45, 9, stroke=0, fill=1)
    c.setFillColor(white)
    c.circle(x + 24, y + h - 22, 12, stroke=0, fill=1)
    set_font(c, 10, bold=True, color=accent)
    c.drawCentredString(x + 24, y + h - 26, "G")
    set_font(c, 9, bold=True, color=accent)
    c.drawString(x + 43, y + h - 19, name)
    set_font(c, 6.5, color=accent)
    c.drawString(x + 43, y + h - 33, count)
    c.setFillColor(white)
    c.circle(x + w - 97, y + h - 22, 11, stroke=1, fill=1)
    set_font(c, 9, bold=True, color=accent)
    c.drawCentredString(x + w - 97, y + h - 26, "v")
    c.setFillColor(soft)
    c.roundRect(x + w - 79, y + h - 35, 66, 26, 8, stroke=0, fill=1)
    set_font(c, 6.8, bold=True, color=accent)
    c.drawCentredString(x + w - 46, y + h - 26, "まとめて開く")
    row_y = y + h - 69
    for link in links:
        c.setStrokeColor(LINE)
        c.line(x + 12, row_y + 13, x + w - 12, row_y + 13)
        c.setFillColor(LINK_SOFT)
        c.roundRect(x + 13, row_y - 2, 21, 21, 6, stroke=0, fill=1)
        set_font(c, 7.5, bold=True, color=LINK_BLUE)
        c.drawCentredString(x + 23.5, row_y + 5, "L")
        set_font(c, 7.8, bold=True, color=HexColor("#20396F"))
        c.drawString(x + 42, row_y + 6, link)
        row_y -= 27


def draw_group_dialog_mock(c, x, y, w, h):
    rounded_panel(c, x, y, w, h, fill=white, stroke=LINE, radius=14)
    set_font(c, 6.5, bold=True, color=BLUE)
    c.drawString(x + 18, y + h - 24, "GROUP")
    set_font(c, 15, bold=True)
    c.drawString(x + 18, y + h - 45, "新しいグループ")
    set_font(c, 7.3, bold=True, color=MUTED)
    c.drawString(x + 18, y + h - 73, "グループ名")
    rounded_panel(c, x + 18, y + h - 113, w - 36, 31, fill=white, stroke=BLUE, radius=7)
    set_font(c, 7.5, color=LIGHT_MUTED)
    c.drawString(x + 28, y + h - 102, "例：毎朝開く")
    set_font(c, 7.3, bold=True, color=MUTED)
    c.drawString(x + 18, y + h - 139, "アイコン（30種類）")
    icon_y = y + h - 169
    for row in range(2):
        for col in range(9):
            bx = x + 18 + col * 28
            by = icon_y - row * 30
            c.setFillColor(BLUE_SOFT if row == 0 and col == 0 else CANVAS)
            c.setStrokeColor(BLUE if row == 0 and col == 0 else LINE)
            c.roundRect(bx, by, 23, 23, 6, stroke=1, fill=1)
            set_font(c, 6.8, bold=True, color=BLUE if row == 0 and col == 0 else MUTED)
            c.drawCentredString(bx + 11.5, by + 7.5, str(col + 1 + row * 9))
    set_font(c, 7.3, bold=True, color=MUTED)
    c.drawString(x + 18, y + 77, "グループ見出しの背景色")
    c.drawString(x + 18, y + 64, "見出しやアクセントに反映されます")
    for i, color in enumerate([BLUE, PURPLE, GREEN, ORANGE, RED]):
        c.setFillColor(color)
        c.circle(x + 29 + i * 33, y + 42, 8, stroke=0, fill=1)
        if i == 0:
            c.setStrokeColor(INK)
            c.setLineWidth(1.2)
            c.circle(x + 29, y + 42, 12, stroke=1, fill=0)
    c.setFillColor(BLUE)
    c.roundRect(x + w - 90, y + 18, 70, 29, 8, stroke=0, fill=1)
    set_font(c, 8, bold=True, color=white)
    c.drawCentredString(x + w - 55, y + 28, "保存する")


def draw_link_dialog_mock(c, x, y, w, h):
    rounded_panel(c, x, y, w, h, fill=white, stroke=LINE, radius=14)
    set_font(c, 6.5, bold=True, color=BLUE)
    c.drawString(x + 18, y + h - 24, "LINK")
    set_font(c, 14, bold=True)
    c.drawString(x + 18, y + h - 45, "リンクを追加")
    fields = [
        ("タイトル", "勤怠システム"),
        ("URL", "https://example.com/"),
    ]
    field_y = y + h - 77
    for label, value in fields:
        set_font(c, 7.2, bold=True, color=MUTED)
        c.drawString(x + 18, field_y, label)
        rounded_panel(c, x + 18, field_y - 37, w - 36, 30, fill=white, stroke=LINE, radius=7)
        set_font(c, 7.5, color=INK)
        c.drawString(x + 28, field_y - 26, value)
        field_y -= 63
    c.setFillColor(BLUE)
    c.roundRect(x + w - 90, y + 18, 70, 29, 8, stroke=0, fill=1)
    set_font(c, 8, bold=True, color=white)
    c.drawCentredString(x + w - 55, y + 28, "保存する")


def draw_editor_mock(c, x, y, w, h):
    rounded_panel(c, x, y, w, h, fill=white, stroke=LINE, radius=13)
    set_font(c, 10, bold=True)
    c.drawString(x + 16, y + h - 25, "グループとリンク")
    set_font(c, 6.5, color=MUTED)
    c.drawString(x + 16, y + h - 38, "矢印ボタンで表示順を変更できます。")

    gx = x + 14
    gy = y + 18
    gw = w - 28
    gh = h - 68
    rounded_panel(c, gx, gy, gw, gh, fill=HexColor("#F8FAFF"), stroke=LINE, radius=10)
    c.setFillColor(BLUE)
    c.roundRect(gx, gy, 5, gh, 2.5, stroke=0, fill=1)
    c.setFillColor(BLUE_SOFT)
    c.roundRect(gx + 5, gy + gh - 62, gw - 5, 62, 8, stroke=0, fill=1)
    c.setFillColor(white)
    c.roundRect(gx + 15, gy + gh - 48, 34, 34, 9, stroke=0, fill=1)
    set_font(c, 11, bold=True, color=BLUE)
    c.drawCentredString(gx + 32, gy + gh - 38, "G")
    pill(c, gx + 60, gy + gh - 24, "GROUP", fill=BLUE, color=white, size=5.8, h=14, pad_x=6)
    set_font(c, 10, bold=True, color=BLUE)
    c.drawString(gx + 60, gy + gh - 41, "毎朝開く")
    set_font(c, 6.5, color=BLUE)
    c.drawString(gx + 60, gy + gh - 54, "2件のリンク")

    button_x = gx + gw - 183
    c.setFillColor(BLUE_SOFT)
    c.roundRect(button_x, gy + gh - 45, 70, 28, 7, stroke=0, fill=1)
    set_font(c, 6.8, bold=True, color=BLUE)
    c.drawCentredString(button_x + 35, gy + gh - 36, "+ リンク追加")
    for idx, (label, fill, color) in enumerate(
        [("↑", BLUE_SOFT, BLUE), ("↓", BLUE_SOFT, BLUE), ("edit", ORANGE_SOFT, ORANGE), ("×", RED_SOFT, RED)]
    ):
        bx = button_x + 76 + idx * 27
        c.setFillColor(fill)
        c.roundRect(bx, gy + gh - 45, 23, 28, 7, stroke=0, fill=1)
        draw_action_icon(c, bx + 11.5, gy + gh - 31, label, color, size=9)

    row_y = gy + gh - 113
    for title, url in [
        ("Outlook", "https://outlook.office.com/"),
        ("Microsoft Teams", "https://teams.microsoft.com/"),
    ]:
        rounded_panel(c, gx + 14, row_y, gw - 28, 42, fill=white, stroke=LINE, radius=8)
        c.setFillColor(HexColor("#7894D7"))
        c.roundRect(gx + 14, row_y, 4, 42, 2, stroke=0, fill=1)
        c.setFillColor(LINK_SOFT)
        c.roundRect(gx + 26, row_y + 9, 23, 23, 6, stroke=0, fill=1)
        set_font(c, 7.5, bold=True, color=LINK_BLUE)
        c.drawCentredString(gx + 37.5, row_y + 17, "L")
        pill(c, gx + 58, row_y + 22, "LINK", fill=LINK_SOFT, color=LINK_BLUE, size=5.3, h=12, pad_x=5)
        set_font(c, 7.8, bold=True, color=HexColor("#20396F"))
        c.drawString(gx + 95, row_y + 24, title)
        set_font(c, 5.8, color=LIGHT_MUTED)
        c.drawString(gx + 58, row_y + 9, url)
        actions_x = gx + gw - 120
        for idx, (label, fill, color) in enumerate(
            [("↑", BLUE_SOFT, BLUE), ("↓", BLUE_SOFT, BLUE), ("edit", ORANGE_SOFT, ORANGE), ("×", RED_SOFT, RED)]
        ):
            bx = actions_x + idx * 27
            c.setFillColor(fill)
            c.roundRect(bx, row_y + 8, 23, 26, 7, stroke=0, fill=1)
            draw_action_icon(c, bx + 11.5, row_y + 21, label, color, size=8)
        row_y -= 49


def draw_action_legend(c, x, y, label, symbol, color, soft, body):
    w = 157
    h = 65
    rounded_panel(c, x, y, w, h, fill=white, stroke=LINE, radius=10)
    c.setFillColor(soft)
    c.roundRect(x + 12, y + 14, 36, 36, 9, stroke=0, fill=1)
    draw_action_icon(c, x + 30, y + 32, symbol, color, size=16)
    set_font(c, 9, bold=True, color=color)
    c.drawString(x + 59, y + 39, label)
    draw_wrapped(c, body, x + 59, y + 24, w - 70, size=7, leading=10, color=MUTED, max_lines=2)


def draw_flow_box(c, x, y, w, title, body, accent, soft):
    rounded_panel(c, x, y, w, 96, fill=white, stroke=LINE, radius=12)
    c.setFillColor(soft)
    c.circle(x + w / 2, y + 68, 17, stroke=0, fill=1)
    set_font(c, 12, bold=True, color=accent)
    c.drawCentredString(x + w / 2, y + 64, title[0])
    set_font(c, 9.5, bold=True, color=INK)
    c.drawCentredString(x + w / 2, y + 39, title)
    draw_centered_wrapped(c, body, x + w / 2, y + 23, w - 24, size=6.9, leading=9.5, color=MUTED)


def cover_page(c):
    c.setFillColor(CANVAS)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(BLUE)
    c.circle(PAGE_W + 10, PAGE_H - 50, 180, stroke=0, fill=1)
    c.setFillColor(BLUE_DARK)
    c.circle(PAGE_W - 10, PAGE_H - 35, 126, stroke=0, fill=1)
    c.setStrokeColor(Color(1, 1, 1, alpha=0.25))
    c.setLineWidth(1)
    c.circle(PAGE_W - 70, PAGE_H - 70, 66, stroke=1, fill=0)
    c.circle(PAGE_W - 70, PAGE_H - 70, 39, stroke=1, fill=0)

    c.setFillColor(BLUE)
    c.roundRect(MARGIN, PAGE_H - 155, 58, 58, 18, stroke=0, fill=1)
    set_font(c, 26, bold=True, color=white)
    c.drawCentredString(MARGIN + 29, PAGE_H - 136, "L")
    set_font(c, 10, bold=True, color=BLUE)
    c.drawString(MARGIN, PAGE_H - 198, "CHROME / EDGE EXTENSION")
    set_font(c, 34, bold=True, color=INK)
    c.drawString(MARGIN, PAGE_H - 246, "LinkMemo")
    set_font(c, 23, bold=True, color=INK)
    c.drawString(MARGIN, PAGE_H - 282, "かんたん利用マニュアル")
    draw_wrapped(
        c,
        "仕事で使うページを、グループごとにまとめて開く。\n初めての方でも迷わない、導入から日常操作までのガイドです。",
        MARGIN,
        PAGE_H - 319,
        385,
        size=11,
        leading=18,
        color=MUTED,
    )

    # Three feature cards
    card_y = 245
    features = [
        ("01", "まとめて起動", "毎朝使うページを\nワンクリックで開く"),
        ("02", "見やすく整理", "グループと背景色で\n用途を分かりやすく"),
        ("03", "安全に保存", "データはブラウザー内\nバックアップも可能"),
    ]
    card_w = 157
    for i, (num, title, body) in enumerate(features):
        x = MARGIN + i * (card_w + 13)
        rounded_panel(c, x, card_y, card_w, 120, fill=white, stroke=LINE, radius=14)
        pill(c, x + 14, card_y + 87, num, fill=BLUE_SOFT, color=BLUE, size=7.5)
        set_font(c, 11, bold=True)
        c.drawString(x + 14, card_y + 63, title)
        draw_wrapped(c, body, x + 14, card_y + 42, card_w - 28, size=8, leading=13, color=MUTED)

    set_font(c, 8.5, bold=True, color=BLUE)
    c.drawString(MARGIN, 91, "対象バージョン 1.1.0")
    set_font(c, 8.5, color=MUTED)
    c.drawString(MARGIN, 72, "対応ブラウザー：Google Chrome / Microsoft Edge")
    c.drawString(MARGIN, 54, "発行日：2026年7月")
    c.showPage()


def overview_page(c):
    draw_header(c, "はじめに", 2)
    draw_page_title(
        c,
        "OVERVIEW",
        "LinkMemoでできること",
        "仕事開始時に必要なWebページを探す手間を減らし、いつもの環境をすぐに準備できます。",
    )
    card_y = 552
    cards = [
        ("1", "登録する", "仕事で使うリンクを\nグループにまとめます", BLUE, BLUE_SOFT),
        ("2", "選んで開く", "グループ単位または\nすべてまとめて開きます", PURPLE, PURPLE_SOFT),
        ("3", "すぐ仕事開始", "必要なタブがそろった\n状態から始められます", GREEN, GREEN_SOFT),
    ]
    for i, (num, title, body, accent, soft) in enumerate(cards):
        x = MARGIN + i * 171
        rounded_panel(c, x, card_y, 158, 116, fill=white, stroke=LINE, radius=13)
        c.setFillColor(soft)
        c.circle(x + 28, card_y + 86, 15, stroke=0, fill=1)
        set_font(c, 10, bold=True, color=accent)
        c.drawCentredString(x + 28, card_y + 82.5, num)
        set_font(c, 11, bold=True)
        c.drawString(x + 49, card_y + 83, title)
        draw_wrapped(c, body, x + 15, card_y + 55, 128, size=8.2, leading=13, color=MUTED)

    set_font(c, 14, bold=True)
    c.drawString(MARGIN, 530, "まず覚える3つの言葉")
    terms = [
        ("グループ", "「毎朝開く」「プロジェクト」など、リンクをまとめる箱です。", BLUE, BLUE_SOFT),
        ("リンク", "Outlookや社内ポータルなど、実際に開くWebページです。", LINK_BLUE, LINK_SOFT),
        ("クイック追加", "現在表示中のタブを、その場ですぐグループへ登録する機能です。", ORANGE, ORANGE_SOFT),
    ]
    term_y = 459
    for title, body, accent, soft in terms:
        rounded_panel(c, MARGIN, term_y, PAGE_W - MARGIN * 2, 55, fill=white, stroke=LINE, radius=10)
        pill(c, MARGIN + 13, term_y + 27, title, fill=soft, color=accent, size=7.5, h=18)
        draw_wrapped(c, body, MARGIN + 105, term_y + 33, 390, size=8.5, leading=12, color=INK)
        term_y -= 66

    draw_callout(
        c,
        MARGIN,
        144,
        PAGE_W - MARGIN * 2,
        73,
        "データの保存場所",
        "登録内容は使用中のブラウザー内に保存されます。外部サーバーへ自動送信されません。ChromeとEdgeのデータは別々です。",
        "success",
    )
    set_font(c, 8.5, bold=True, color=INK)
    c.drawString(MARGIN, 112, "このマニュアルのおすすめ順：")
    set_font(c, 8.5, color=MUTED)
    c.drawString(MARGIN + 132, 112, "インストール → 初期設定 → 毎日の使い方 → バックアップ")
    c.showPage()


def install_page(c, browser, page):
    scheme = "CHROME" if browser == "Chrome" else "EDGE"
    section = f"{browser}への導入"
    draw_header(c, section, page)
    url = "chrome://extensions/" if browser == "Chrome" else "edge://extensions/"
    mode_label = "デベロッパー モード" if browser == "Chrome" else "開発者モード"
    load_label = "パッケージ化されていない拡張機能を読み込む" if browser == "Chrome" else "展開して読み込み"
    draw_page_title(
        c,
        f"INSTALLATION - {scheme}",
        f"{browser}にインストールする",
        "会社のルールで拡張機能の追加が制限されている場合は、先にシステム管理者へ確認してください。",
    )
    draw_extension_page_mock(c, 310, 413, 243, 257, browser=browser)
    steps = [
        ("拡張機能ページを開く", f"アドレスバーへ「{url}」と入力してEnterキーを押します。"),
        (f"「{mode_label}」をオン", "拡張機能ページの上部または左側にあるスイッチをオンにします。"),
        (f"「{load_label}」を押す", "フォルダーを選択する画面が表示されます。"),
        ("LinkMemoフォルダーを選択", r"C:\Users\ユーザー名\codex\LinkMemo など、配布されたフォルダーを指定します。"),
        ("ツールバーへ固定", "拡張機能メニューを開き、LinkMemoを固定すると毎日すぐ使えます。"),
    ]
    y = 613
    for i, (title, body) in enumerate(steps, 1):
        h = 63
        rounded_panel(c, MARGIN, y, 244, h, fill=white, stroke=LINE, radius=10)
        draw_number(c, MARGIN + 24, y + h / 2, i, BLUE, radius=12)
        set_font(c, 9.2, bold=True)
        c.drawString(MARGIN + 45, y + h - 22, title)
        draw_wrapped(c, body, MARGIN + 45, y + h - 39, 184, size=7.2, leading=10, color=MUTED, max_lines=2)
        y -= 72

    draw_callout(
        c,
        MARGIN,
        122,
        PAGE_W - MARGIN * 2,
        78,
        "インストール後に更新内容を反映する方法",
        f"LinkMemoを更新したときは「{url}」を開き、LinkMemoカードにある更新ボタンを押してください。登録済みデータは通常そのまま残ります。",
        "info",
    )
    c.showPage()


def first_setup_page(c):
    draw_header(c, "初期設定", 5)
    draw_page_title(
        c,
        "FIRST SETUP",
        "最初のグループを作る",
        "用途ごとにグループを作ると、仕事開始時に必要なページだけをまとめて開けます。",
    )
    draw_group_dialog_mock(c, 290, 285, 263, 390)

    steps = [
        ("編集画面を開く", "ポップアップ右上の歯車ボタンを押します。"),
        ("新しいグループ", "編集画面右上の「+ 新しいグループ」を押します。"),
        ("名前を入力", "例：毎朝開く、営業、プロジェクトA、社内システム"),
        ("アイコンを選ぶ", "30種類から、用途を連想しやすいものを選びます。"),
        ("背景色を選ぶ", "グループ見出しとアクセントの色になります。"),
        ("保存する", "「保存する」を押すとグループが追加されます。"),
    ]
    y = 621
    for i, (title, body) in enumerate(steps, 1):
        rounded_panel(c, MARGIN, y, 226, 54, fill=white, stroke=LINE, radius=10)
        draw_number(c, MARGIN + 22, y + 27, i, BLUE, radius=11)
        set_font(c, 8.8, bold=True)
        c.drawString(MARGIN + 42, y + 33, title)
        draw_wrapped(c, body, MARGIN + 42, y + 18, 170, size=6.9, leading=9.5, color=MUTED, max_lines=2)
        y -= 62

    draw_callout(
        c,
        MARGIN,
        132,
        PAGE_W - MARGIN * 2,
        76,
        "おすすめの分け方",
        "まずは「毎朝開く」と「必要なときに開く」の2グループから始めると簡単です。細かく分けすぎず、実際の仕事の流れに合わせて増やしてください。",
        "success",
    )
    c.showPage()


def add_links_page(c):
    draw_header(c, "リンクの登録", 6)
    draw_page_title(
        c,
        "ADD LINKS",
        "Webページを登録する",
        "編集画面からURLを入力する方法と、現在のタブをすぐ登録する方法があります。",
    )

    pill(c, MARGIN, 654, "方法 1", fill=BLUE, color=white, size=7.5)
    set_font(c, 14, bold=True)
    c.drawString(MARGIN, 628, "編集画面から登録")
    draw_link_dialog_mock(c, 318, 430, 235, 245)
    method_steps = [
        ("1", "対象グループの「+ リンク追加」を押す"),
        ("2", "分かりやすいタイトルを入力する"),
        ("3", "URLを入力して「保存する」を押す"),
    ]
    y = 570
    for num, text in method_steps:
        draw_number(c, MARGIN + 15, y + 5, num, BLUE, radius=11)
        draw_wrapped(c, text, MARGIN + 35, y + 10, 225, size=8.6, leading=12, color=INK, bold=True)
        y -= 53

    c.setStrokeColor(LINE)
    c.line(MARGIN, 387, PAGE_W - MARGIN, 387)
    pill(c, MARGIN, 351, "方法 2", fill=PURPLE, color=white, size=7.5)
    set_font(c, 14, bold=True)
    c.drawString(MARGIN, 325, "現在のタブをクイック追加")
    draw_popup_mock(c, 328, 72, 225, 290, show_quick_add=True)
    quick_steps = [
        ("1", "登録したいWebページを表示します。"),
        ("2", "LinkMemoの「+ 現在のタブ」を押します。"),
        ("3", "追加先グループを選び「追加する」を押します。"),
    ]
    y = 270
    for num, text in quick_steps:
        draw_number(c, MARGIN + 15, y + 5, num, PURPLE, radius=11)
        draw_wrapped(c, text, MARGIN + 35, y + 10, 245, size=8.3, leading=12, color=INK, bold=True)
        y -= 48
    draw_callout(
        c,
        MARGIN,
        75,
        260,
        73,
        "前回の追加先を記憶",
        "次回は、前回選んだグループが最初から選択されます。",
        "info",
    )
    c.showPage()


def daily_use_page(c):
    draw_header(c, "毎日の使い方", 7)
    draw_page_title(
        c,
        "DAILY WORKFLOW",
        "仕事を始める",
        "ツールバーのLinkMemoアイコンを押し、目的に合った開き方を選びます。",
    )
    draw_popup_mock(c, MARGIN, 104, 270, 575, show_quick_add=False)
    actions = [
        ("1", "すべて開く", "登録されているすべてのリンクを新しいタブで開きます。"),
        ("2", "まとめて開く", "そのグループ内のリンクだけをまとめて開きます。"),
        ("3", "リンク名を押す", "必要なWebページを1つだけ開きます。"),
        ("4", "丸い矢印を押す", "グループを折りたたみ／展開できます。状態は保存されます。"),
        ("5", "歯車を押す", "登録内容の編集画面を開きます。"),
    ]
    y = 607
    for num, title, body in actions:
        x = 332
        rounded_panel(c, x, y, 221, 78, fill=white, stroke=LINE, radius=11)
        draw_number(c, x + 22, y + 54, num, BLUE, radius=11)
        set_font(c, 9.5, bold=True)
        c.drawString(x + 42, y + 51, title)
        draw_wrapped(c, body, x + 16, y + 29, 189, size=7.5, leading=10.5, color=MUTED, max_lines=2)
        y -= 91
    draw_callout(
        c,
        332,
        107,
        221,
        68,
        "同じURLは重複して開きません",
        "「すべて開く」では、同じURLが複数グループにあっても1回だけ開きます。",
        "success",
    )
    c.showPage()


def editing_page(c):
    draw_header(c, "編集と並べ替え", 8)
    draw_page_title(
        c,
        "MANAGE",
        "登録内容を整理する",
        "グループとリンクは背景・ラベルで区別され、操作ボタンも役割ごとに色分けされています。",
    )
    draw_editor_mock(c, MARGIN, 370, PAGE_W - MARGIN * 2, 305)

    set_font(c, 13.5, bold=True)
    c.drawString(MARGIN, 356, "操作ボタンの色")
    draw_action_legend(c, MARGIN, 272, "移動", "↑ ↓", BLUE, BLUE_SOFT, "表示順を上下へ移動")
    draw_action_legend(c, MARGIN + 170, 272, "編集", "edit", ORANGE, ORANGE_SOFT, "名前・URL・色を変更")
    draw_action_legend(c, MARGIN + 340, 272, "削除", "×", RED, RED_SOFT, "確認後に項目を削除")

    draw_callout(
        c,
        MARGIN,
        172,
        PAGE_W - MARGIN * 2,
        72,
        "削除するときの注意",
        "グループを削除すると、その中に登録されているリンクも削除されます。大きな変更の前にバックアップを作成しておくと安心です。",
        "warning",
    )
    draw_callout(
        c,
        MARGIN,
        86,
        PAGE_W - MARGIN * 2,
        67,
        "ボタンがグレーの場合",
        "先頭項目の「上へ」、末尾項目の「下へ」など、実行できない操作はグレーで表示されます。",
        "info",
    )
    c.showPage()


def backup_page(c):
    draw_header(c, "バックアップと移行", 9)
    draw_page_title(
        c,
        "BACKUP / TRANSFER",
        "登録内容を保存・移行する",
        "ChromeとEdgeのデータは自動同期されません。JSONバックアップを使って安全に移行できます。",
    )
    flow_y = 547
    draw_flow_box(c, MARGIN, flow_y, 135, "Chrome", "編集画面から\nエクスポート", BLUE, BLUE_SOFT)
    draw_flow_box(c, MARGIN + 188, flow_y, 135, "JSONファイル", "登録内容を保存する\nバックアップ", ORANGE, ORANGE_SOFT)
    draw_flow_box(c, MARGIN + 376, flow_y, 135, "Edge", "編集画面から\nインポート", GREEN, GREEN_SOFT)
    set_font(c, 18, bold=True, color=LIGHT_MUTED)
    c.drawCentredString(MARGIN + 162, flow_y + 46, ">")
    c.drawCentredString(MARGIN + 350, flow_y + 46, ">")

    set_font(c, 14, bold=True)
    c.drawString(MARGIN, 510, "エクスポート")
    export_steps = [
        "編集画面の一番下にある「エクスポート」を押す",
        "backup-ext_LinkMemo_日付_時刻.json が保存される",
        "社内ルールに従って安全な場所へ保管する",
    ]
    y = 474
    for i, text in enumerate(export_steps, 1):
        draw_number(c, MARGIN + 14, y + 4, i, BLUE, radius=10)
        set_font(c, 8.2, color=INK)
        c.drawString(MARGIN + 33, y, text)
        y -= 32

    set_font(c, 14, bold=True)
    c.drawString(MARGIN + 274, 510, "インポート")
    import_steps = [
        "移行先ブラウザーで編集画面を開く",
        "「インポート」を押してJSONファイルを選ぶ",
        "グループ数・リンク数を確認する",
    ]
    y = 474
    for i, text in enumerate(import_steps, 1):
        draw_number(c, MARGIN + 288, y + 4, i, GREEN, radius=10)
        set_font(c, 8.2, color=INK)
        c.drawString(MARGIN + 307, y, text)
        y -= 32

    draw_callout(
        c,
        MARGIN,
        233,
        PAGE_W - MARGIN * 2,
        78,
        "インポート時の注意",
        "インポートすると、移行先ブラウザーの現在の登録内容はバックアップファイルの内容に置き換わります。必要なら先に移行先でもエクスポートしてください。",
        "warning",
    )
    draw_callout(
        c,
        MARGIN,
        130,
        PAGE_W - MARGIN * 2,
        78,
        "バックアップファイルの取り扱い",
        "JSONファイルには登録したタイトルとURLが含まれます。社内システムのURLなどが含まれる場合は、メールや公開ストレージで無断共有しないでください。",
        "danger",
    )
    c.showPage()


def troubleshooting_page(c):
    draw_header(c, "困ったとき", 10)
    draw_page_title(
        c,
        "TROUBLESHOOTING",
        "困ったときの確認ポイント",
        "よくある状況と対処方法をまとめています。解決しない場合は管理者または配布元へ連絡してください。",
    )
    rows = [
        ("アイコンが見つからない", "ブラウザーの拡張機能メニューを開き、LinkMemoをツールバーへ固定します。"),
        ("画面が更新されない", "拡張機能ページを開き、LinkMemoの更新ボタンを押してから再度開きます。"),
        ("現在のタブを追加できない", "chrome:// や edge:// などのブラウザー内部ページは登録できません。通常のWebページで試します。"),
        ("一括でタブが開かない", "リンクのURLが http:// または https:// で始まるか、編集画面で確認します。"),
        ("ChromeとEdgeで内容が違う", "自動同期されません。エクスポート／インポートで内容を移行します。"),
        ("誤って削除した", "バックアップJSONがあれば、編集画面のインポートから復元できます。"),
    ]
    y = 610
    for question, answer in rows:
        rounded_panel(c, MARGIN, y, PAGE_W - MARGIN * 2, 65, fill=white, stroke=LINE, radius=10)
        c.setFillColor(BLUE_SOFT)
        c.circle(MARGIN + 24, y + 32.5, 13, stroke=0, fill=1)
        set_font(c, 10, bold=True, color=BLUE)
        c.drawCentredString(MARGIN + 24, y + 29, "?")
        set_font(c, 9.2, bold=True, color=INK)
        c.drawString(MARGIN + 47, y + 42, question)
        draw_wrapped(c, answer, MARGIN + 47, y + 24, 445, size=7.6, leading=10.5, color=MUTED, max_lines=2)
        y -= 75

    draw_callout(
        c,
        MARGIN,
        117,
        PAGE_W - MARGIN * 2,
        76,
        "安心して利用するために",
        "信頼できるWebページだけを登録し、バックアップファイルは適切に管理してください。LinkMemoは登録内容を外部サーバーへ自動送信しません。",
        "success",
    )
    set_font(c, 8.5, bold=True, color=INK)
    c.drawString(MARGIN, 87, "配布元への問い合わせ時に伝える情報：")
    set_font(c, 8.2, color=MUTED)
    c.drawString(MARGIN + 195, 87, "ブラウザー名 / LinkMemoのバージョン / 発生した操作")
    c.showPage()


def build_pdf():
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("LinkMemo Chrome / Edge かんたん利用マニュアル")
    c.setAuthor("LinkMemo")
    c.setSubject("LinkMemo Version 1.1.0 User Guide")

    cover_page(c)
    overview_page(c)
    install_page(c, "Chrome", 3)
    install_page(c, "Edge", 4)
    first_setup_page(c)
    add_links_page(c)
    daily_use_page(c)
    editing_page(c)
    backup_page(c)
    troubleshooting_page(c)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
