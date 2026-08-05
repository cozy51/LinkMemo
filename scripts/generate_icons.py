from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 4


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
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def rounded_rect_sdf(x: float, y: float, cx: float, cy: float, width: float, height: float, radius: float) -> float:
    qx = abs(x - cx) - width / 2 + radius
    qy = abs(y - cy) - height / 2 + radius
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius


def distance_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx = bx - ax
    vy = by - ay
    wx = px - ax
    wy = py - ay
    ratio = max(0, min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
    return math.hypot(px - (ax + ratio * vx), py - (ay + ratio * vy))


def render_icon(size: int) -> bytearray:
    high_width = size * SUPERSAMPLE
    high_height = size * SUPERSAMPLE
    high_res = bytearray(high_width * high_height * 4)
    gradient_start = rgb("#6d85f5")
    gradient_end = rgb("#3552cf")

    for y in range(high_height):
        for x in range(high_width):
            ux = (x + 0.5) / SUPERSAMPLE
            uy = (y + 0.5) / SUPERSAMPLE
            red = green = blue = alpha = 0

            bg_distance = rounded_rect_sdf(
                ux,
                uy,
                size / 2,
                size / 2,
                size * 118 / 128,
                size * 118 / 128,
                size * 34 / 128,
            )
            if bg_distance <= 0:
                position = (ux + uy) / (2 * size)
                red = int(gradient_start[0] * (1 - position) + gradient_end[0] * position)
                green = int(gradient_start[1] * (1 - position) + gradient_end[1] * position)
                blue = int(gradient_start[2] * (1 - position) + gradient_end[2] * position)
                alpha = 255

            px = ux * 128 / size
            py = uy * 128 / size
            angle = math.radians(35)
            center = 64
            local_x = center + (px - center) * math.cos(angle) - (py - center) * math.sin(angle)
            local_y = center + (px - center) * math.sin(angle) + (py - center) * math.cos(angle)
            stroke_width = 13
            chain_distance = min(
                abs(rounded_rect_sdf(local_x, local_y, 35, 70, 38, 44, 22)),
                abs(rounded_rect_sdf(local_x, local_y, 93, 70, 38, 44, 22)),
                distance_to_segment(local_x, local_y, 46, 70, 82, 70),
            )
            if chain_distance <= stroke_width / 2:
                red = green = blue = alpha = 255

            index = (y * high_width + x) * 4
            high_res[index : index + 4] = bytes((red, green, blue, alpha))

    output = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            totals = [0, 0, 0, 0]
            for yy in range(SUPERSAMPLE):
                for xx in range(SUPERSAMPLE):
                    source = ((y * SUPERSAMPLE + yy) * high_width + x * SUPERSAMPLE + xx) * 4
                    for channel in range(4):
                        totals[channel] += high_res[source + channel]
            target = (y * size + x) * 4
            output[target : target + 4] = bytes(total // (SUPERSAMPLE * SUPERSAMPLE) for total in totals)

    return output


def main() -> None:
    for size in SIZES:
        write_png(ICON_DIR / f"icon{size}.png", size, size, render_icon(size))


if __name__ == "__main__":
    main()
