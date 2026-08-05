"""icons/icon.svg から各サイズの PNG アイコンを生成する。

外部ライブラリを使わず、SVG のパスを直接ラスタライズする。
実行: python3 scripts/generate_icons.py
"""

from __future__ import annotations

import math
import re
import struct
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
SVG_PATH = ICON_DIR / "icon.svg"
SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 3
CURVE_STEPS = 24
SVG_NS = "{http://www.w3.org/2000/svg}"

Point = tuple[float, float]


def write_png(path: Path, width: int, height: int, rgba: bytearray) -> None:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    rows = [b"\x00" + bytes(rgba[y * width * 4 : (y + 1) * width * 4]) for y in range(height)]
    payload = b"".join(rows)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(payload, 9))
        + chunk(b"IEND", b"")
    )


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


TOKEN_RE = re.compile(r"[MmLlHhVvCcSsZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?")


def flatten_path(data: str) -> list[list[Point]]:
    """SVG のパス文字列を折れ線（サブパスの点列）へ変換する。"""

    tokens = TOKEN_RE.findall(data)
    subpaths: list[list[Point]] = []
    current: list[Point] = []
    index = 0
    command = ""
    x = y = 0.0
    start_x = start_y = 0.0
    last_control: Point | None = None

    def number() -> float:
        nonlocal index
        value = float(tokens[index])
        index += 1
        return value

    def cubic(x1: float, y1: float, x2: float, y2: float, x3: float, y3: float) -> None:
        nonlocal x, y
        for step in range(1, CURVE_STEPS + 1):
            t = step / CURVE_STEPS
            u = 1 - t
            current.append(
                (
                    u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
                    u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
                )
            )
        x, y = x3, y3

    while index < len(tokens):
        if TOKEN_RE.fullmatch(tokens[index]) and tokens[index].isalpha():
            command = tokens[index]
            index += 1
        elif command in ("M", "m"):
            command = "L" if command == "M" else "l"

        if command in ("M", "m"):
            dx, dy = number(), number()
            x, y = (dx, dy) if command == "M" else (x + dx, y + dy)
            start_x, start_y = x, y
            if current:
                subpaths.append(current)
            current = [(x, y)]
            last_control = None
        elif command in ("L", "l"):
            dx, dy = number(), number()
            x, y = (dx, dy) if command == "L" else (x + dx, y + dy)
            current.append((x, y))
            last_control = None
        elif command in ("H", "h"):
            dx = number()
            x = dx if command == "H" else x + dx
            current.append((x, y))
            last_control = None
        elif command in ("V", "v"):
            dy = number()
            y = dy if command == "V" else y + dy
            current.append((x, y))
            last_control = None
        elif command in ("C", "c"):
            values = [number() for _ in range(6)]
            if command == "c":
                values = [values[0] + x, values[1] + y, values[2] + x, values[3] + y, values[4] + x, values[5] + y]
            last_control = (values[2], values[3])
            cubic(*values)
        elif command in ("S", "s"):
            values = [number() for _ in range(4)]
            if command == "s":
                values = [values[0] + x, values[1] + y, values[2] + x, values[3] + y]
            control_x, control_y = last_control or (x, y)
            first = (2 * x - control_x, 2 * y - control_y)
            last_control = (values[0], values[1])
            cubic(first[0], first[1], values[0], values[1], values[2], values[3])
        elif command in ("Z", "z"):
            current.append((start_x, start_y))
            x, y = start_x, start_y
            subpaths.append(current)
            current = []
            last_control = None
        else:  # 未対応コマンドは読み飛ばす
            index += 1

    if current:
        subpaths.append(current)
    return subpaths


def parse_transform(value: str) -> tuple[float, float, float]:
    """rotate(angle cx cy) を (ラジアン, cx, cy) として取り出す。"""

    match = re.search(r"rotate\(\s*([-\d.]+)(?:[ ,]+([-\d.]+)[ ,]+([-\d.]+))?\s*\)", value or "")
    if not match:
        return 0.0, 0.0, 0.0
    angle = math.radians(float(match.group(1)))
    cx = float(match.group(2) or 0.0)
    cy = float(match.group(3) or 0.0)
    return angle, cx, cy


class IconSource:
    """icon.svg から描画に必要な情報を取り出したもの。"""

    def __init__(self, svg_path: Path) -> None:
        root = ET.fromstring(svg_path.read_text(encoding="utf-8"))
        view_box = [float(value) for value in root.get("viewBox", "0 0 128 128").split()]
        self.view_size = view_box[2]

        gradient = root.find(f".//{SVG_NS}linearGradient")
        self.gradient_axis = (
            float(gradient.get("x1", 0)),
            float(gradient.get("y1", 0)),
            float(gradient.get("x2", 0)),
            float(gradient.get("y2", 0)),
        )
        stops = gradient.findall(f"{SVG_NS}stop")
        self.gradient_start = rgb(stops[0].get("stop-color", "#000000"))
        self.gradient_end = rgb(stops[-1].get("stop-color", "#000000"))

        rect = root.find(f"{SVG_NS}rect")
        width = float(rect.get("width"))
        height = float(rect.get("height"))
        self.rect_center = (float(rect.get("x")) + width / 2, float(rect.get("y")) + height / 2)
        self.rect_size = (width, height)
        self.rect_radius = float(rect.get("rx", 0))

        group = root.find(f"{SVG_NS}g")
        self.stroke_radius = float(group.get("stroke-width", 1)) / 2
        self.stroke_color = rgb(group.get("stroke", "#ffffff"))
        self.rotation, self.rotation_cx, self.rotation_cy = parse_transform(group.get("transform", ""))

        self.segments: list[tuple[float, float, float, float]] = []
        for path in group.findall(f"{SVG_NS}path"):
            for points in flatten_path(path.get("d", "")):
                for start, end in zip(points, points[1:]):
                    self.segments.append((start[0], start[1], end[0], end[1]))

        margin = self.stroke_radius + 1
        xs = [value for segment in self.segments for value in (segment[0], segment[2])]
        ys = [value for segment in self.segments for value in (segment[1], segment[3])]
        self.stroke_bounds = (min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)


def rounded_rect_sdf(
    px: float, py: float, cx: float, cy: float, width: float, height: float, radius: float
) -> float:
    qx = abs(px - cx) - width / 2 + radius
    qy = abs(py - cy) - height / 2 + radius
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - radius


def distance_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx = bx - ax
    vy = by - ay
    length = vx * vx + vy * vy
    if length == 0:
        return math.hypot(px - ax, py - ay)
    ratio = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / length))
    return math.hypot(px - (ax + ratio * vx), py - (ay + ratio * vy))


def coverage(distance: float, feather: float) -> float:
    """符号付き距離から被覆率（0〜1）を求め、輪郭を滑らかにする。"""

    return max(0.0, min(1.0, 0.5 - distance / feather))


def render_icon(icon: IconSource, size: int) -> bytearray:
    scale = icon.view_size / (size * SUPERSAMPLE)  # サブサンプル1点あたりのSVG座標長
    feather = scale
    samples = SUPERSAMPLE * SUPERSAMPLE
    x1, y1, x2, y2 = icon.gradient_axis
    axis_x, axis_y = x2 - x1, y2 - y1
    axis_length = axis_x * axis_x + axis_y * axis_y
    cos_angle = math.cos(-icon.rotation)
    sin_angle = math.sin(-icon.rotation)
    min_x, min_y, max_x, max_y = icon.stroke_bounds
    stroke_r, stroke_g, stroke_b = icon.stroke_color

    output = bytearray(size * size * 4)
    for py in range(size):
        for px in range(size):
            red = green = blue = alpha = 0.0
            for sub_y in range(SUPERSAMPLE):
                for sub_x in range(SUPERSAMPLE):
                    ux = (px * SUPERSAMPLE + sub_x + 0.5) * scale
                    uy = (py * SUPERSAMPLE + sub_y + 0.5) * scale

                    background = coverage(
                        rounded_rect_sdf(
                            ux,
                            uy,
                            icon.rect_center[0],
                            icon.rect_center[1],
                            icon.rect_size[0],
                            icon.rect_size[1],
                            icon.rect_radius,
                        ),
                        feather,
                    )

                    # rotate(...) の逆回転をピクセル側に適用してパスと比較する
                    dx = ux - icon.rotation_cx
                    dy = uy - icon.rotation_cy
                    local_x = icon.rotation_cx + dx * cos_angle - dy * sin_angle
                    local_y = icon.rotation_cy + dx * sin_angle + dy * cos_angle

                    stroke = 0.0
                    if min_x <= local_x <= max_x and min_y <= local_y <= max_y:
                        nearest = min(
                            distance_to_segment(local_x, local_y, *segment) for segment in icon.segments
                        )
                        stroke = coverage(nearest - icon.stroke_radius, feather)

                    if background <= 0.0 and stroke <= 0.0:
                        continue

                    position = 0.0
                    if axis_length:
                        position = ((ux - x1) * axis_x + (uy - y1) * axis_y) / axis_length
                        position = max(0.0, min(1.0, position))
                    back_r = icon.gradient_start[0] * (1 - position) + icon.gradient_end[0] * position
                    back_g = icon.gradient_start[1] * (1 - position) + icon.gradient_end[1] * position
                    back_b = icon.gradient_start[2] * (1 - position) + icon.gradient_end[2] * position

                    # 乗算済みアルファで合成する（境界の色にじみを防ぐ）
                    sample_alpha = stroke + background * (1 - stroke)
                    red += stroke * stroke_r + (1 - stroke) * background * back_r
                    green += stroke * stroke_g + (1 - stroke) * background * back_g
                    blue += stroke * stroke_b + (1 - stroke) * background * back_b
                    alpha += sample_alpha

            index = (py * size + px) * 4
            if alpha <= 0:
                output[index : index + 4] = b"\x00\x00\x00\x00"
                continue
            output[index : index + 4] = bytes(
                (
                    round(max(0.0, min(255.0, red / alpha))),
                    round(max(0.0, min(255.0, green / alpha))),
                    round(max(0.0, min(255.0, blue / alpha))),
                    round(max(0.0, min(255.0, alpha / samples * 255))),
                )
            )

    return output


def main() -> None:
    icon = IconSource(SVG_PATH)
    for size in SIZES:
        write_png(ICON_DIR / f"icon{size}.png", size, size, render_icon(icon, size))
        print(f"icons/icon{size}.png")


if __name__ == "__main__":
    main()
