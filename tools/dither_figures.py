#!/usr/bin/env python3
"""Dither four public-domain studies into notebook plates.

Not loaded by the page. From the repo root:

    python3 tools/dither_figures.py

Downloads Wikimedia Commons files into tools/.cache and writes
tools/out/fig1.txt … fig4.txt. The page inlines that text; it does not
fetch these files.

Sources, all public domain on Wikimedia Commons:
- Michelangelo, The Creation of Adam (the two hands)
- Leonardo da Vinci, aerial screw, from the sheet with the lifting wing
- Leonardo da Vinci, Codex Madrid I, folio 45 recto (gear train)
- Leonardo da Vinci, Vitruvian Man (circle and square, drawn as an outline)

Each study is grayscale, contrast-stretched, Floyd–Steinberg dithered
at dot resolution, then packed into braille (U+2800). A 72-character
ASCII ramp cannot hold a hand or a gear tooth; braille is two dots by
four, which is the density ramp that still reads. The page sets the
plates in Cascadia Mono, which draws those characters as dots.
"""

from __future__ import annotations

import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
OUT = ROOT / "out"

# Braille dot bit for (row, col) inside a 4×2 cell.
DOTS = (
    (0, 0, 0x01),
    (1, 0, 0x02),
    (2, 0, 0x04),
    (3, 0, 0x08),
    (0, 1, 0x10),
    (1, 1, 0x20),
    (2, 1, 0x40),
    (3, 1, 0x80),
)

SOURCES = {
    "adam": "https://upload.wikimedia.org/wikipedia/commons/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg",
    "screw": "https://upload.wikimedia.org/wikipedia/commons/5/50/Leonardo_da_Vinci_helicopter_and_lifting_wing.jpg",
    "gears": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Codex_Madrid_I%2C_folio_045_recto.jpg",
}

UA = {"User-Agent": "briandi-portfolio-art/1.0 (notebook plates; local dev)"}


def fetch(name: str) -> Image.Image:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.jpg"
    if not path.exists() or path.stat().st_size < 1000:
        request = urllib.request.Request(SOURCES[name], headers=UA)
        with urllib.request.urlopen(request, timeout=90) as response:
            path.write_bytes(response.read())
    return Image.open(path).convert("RGB")


def rel_crop(image: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    width, height = image.size
    left, top, right, bottom = box
    return image.crop(
        (
            int(left * width),
            int(top * height),
            int(right * width),
            int(bottom * height),
        )
    )


def largest(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    small = np.asarray(
        Image.fromarray(mask.astype(np.uint8) * 255).resize(
            (max(1, width // 3), max(1, height // 3)), Image.Resampling.BOX
        )
    ) > 40
    seen = np.zeros_like(small, dtype=bool)
    best: list[tuple[int, int]] = []
    sh, sw = small.shape
    for y in range(sh):
        for x in range(sw):
            if not small[y, x] or seen[y, x]:
                continue
            queue: deque[tuple[int, int]] = deque([(y, x)])
            seen[y, x] = True
            cells = [(y, x)]
            while queue:
                cy, cx = queue.popleft()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((ny, nx))
                            cells.append((ny, nx))
            if len(cells) > len(best):
                best = cells
    keep = np.zeros_like(small)
    for y, x in best:
        keep[y, x] = True
    return (
        np.asarray(
            Image.fromarray(keep.astype(np.uint8) * 255).resize(
                (width, height), Image.Resampling.NEAREST
            )
        )
        > 128
    )


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Fill enclosed gaps. Finger gaps open onto the background, so they stay."""
    empty = ~mask
    height, width = empty.shape
    seen = np.zeros_like(empty, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if empty[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if empty[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width and empty[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return mask | (empty & ~seen)


def drop_specks(mask: np.ndarray, min_count: int) -> np.ndarray:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    keep = np.zeros_like(mask, dtype=bool)
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            queue: deque[tuple[int, int]] = deque([(y, x)])
            seen[y, x] = True
            cells = [(y, x)]
            while queue:
                cy, cx = queue.popleft()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
                        cells.append((ny, nx))
            if len(cells) >= min_count:
                for cy, cx in cells:
                    keep[cy, cx] = True
    return keep


def hand_ink(crop: Image.Image, distance: float) -> np.ndarray:
    """Skin against the plaster wall. Cloak red is dropped."""
    pixels = np.asarray(crop.convert("RGB"), dtype=np.float32)
    red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    wall = pixels[luma > np.percentile(luma, 86)].mean(axis=0)
    dist = np.sqrt(((pixels - wall) ** 2).sum(axis=2))
    cloak = (red > green + 32) & (red > blue + 20) & (luma < 170)
    mask = (dist > distance) & ~cloak
    softened = Image.fromarray(mask.astype(np.uint8) * 255)
    softened = softened.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
    mask = largest(np.asarray(softened) > 128)
    mask = fill_holes(mask)
    blurred = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(1.1))
    soft = np.asarray(blurred).astype(np.float32) / 255.0
    shade = np.clip((dist - distance) / 80.0, 0, 1)
    ink = soft * (0.42 + 0.58 * shade)
    ink = np.where(soft > 0.45, np.maximum(ink, 0.5), ink)
    return ink.astype(np.float32)


def trim(ink: np.ndarray, level: float = 0.25, pad: int = 8) -> np.ndarray:
    ys, xs = np.where(ink > level)
    if len(xs) == 0:
        return ink
    y0, y1 = max(0, int(ys.min()) - pad), min(ink.shape[0], int(ys.max()) + pad + 1)
    x0, x1 = max(0, int(xs.min()) - pad), min(ink.shape[1], int(xs.max()) + pad + 1)
    return ink[y0:y1, x0:x1]


def scale_to_height(ink: np.ndarray, height: int) -> np.ndarray:
    width = max(8, int(round(ink.shape[1] * height / ink.shape[0])))
    picture = Image.fromarray(np.clip(ink * 255, 0, 255).astype(np.uint8))
    picture = picture.resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(picture).astype(np.float32) / 255.0


def tip_row(ink: np.ndarray, side: str) -> int:
    width = ink.shape[1]
    if side == "right":
        region = ink[:, int(width * 0.86) :]
    else:
        region = ink[:, : max(1, int(width * 0.14))]
    rows = np.where(region > 0.4)[0]
    if len(rows) == 0:
        return ink.shape[0] // 2
    return int(np.median(rows))


def hands_pair(adam: Image.Image) -> np.ndarray:
    """Both hands at one height, a small spark in the gap."""
    left = scale_to_height(trim(hand_ink(rel_crop(adam, (0.269, 0.380, 0.387, 0.522)), 62)), 340)
    right = scale_to_height(trim(hand_ink(rel_crop(adam, (0.399, 0.358, 0.510, 0.534)), 54)), 340)
    left_tip, right_tip = tip_row(left, "right"), tip_row(right, "left")
    if left_tip > right_tip:
        shift = left_tip - right_tip
        right = np.pad(right, ((shift, 0), (0, 0)))
        left = np.pad(left, ((0, shift), (0, 0)))
    elif right_tip > left_tip:
        shift = right_tip - left_tip
        left = np.pad(left, ((shift, 0), (0, 0)))
        right = np.pad(right, ((0, shift), (0, 0)))
    gap = 36
    height = max(left.shape[0], right.shape[0])
    width = left.shape[1] + gap + right.shape[1]
    canvas = np.zeros((height, width), dtype=np.float32)
    canvas[: left.shape[0], : left.shape[1]] = left
    canvas[: right.shape[0], left.shape[1] + gap :] = right
    kept = np.where(canvas >= 0.72, canvas, 0)
    speck = drop_specks(kept > 0.2, min_count=80)
    kept = np.where(speck, kept, 0)
    cy = tip_row(kept[:, : left.shape[1]], "right")
    cx = left.shape[1] + gap // 2
    yy = np.arange(height)[:, None]
    xx = np.arange(width)[None, :]
    spark = np.exp(-(((yy - cy) / 14.0) ** 2 + ((xx - cx) / 8.0) ** 2))
    return np.maximum(kept, spark * 0.95)


def stroke_ink(image: Image.Image, percentile: float, dilate: int, blur: int) -> np.ndarray:
    """Dark lines on a light page, with the paper grain lifted out."""
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    background = np.asarray(
        Image.fromarray(gray.astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)),
        dtype=np.float32,
    )
    diff = background - gray
    level = np.percentile(diff, percentile)
    mask = Image.fromarray((diff >= level).astype(np.uint8) * 255)
    if dilate > 1:
        mask = mask.filter(ImageFilter.MaxFilter(dilate))
    mask = mask.filter(ImageFilter.GaussianBlur(0.55))
    return np.asarray(mask).astype(np.float32) / 255.0


def floyd_bits(ink: np.ndarray, cols: int) -> np.ndarray:
    dot_w = cols * 2
    dot_h = max(8, int(round(dot_w * (ink.shape[0] / ink.shape[1]))))
    dot_h -= dot_h % 4
    picture = Image.fromarray(np.clip(ink * 255, 0, 255).astype(np.uint8))
    picture = picture.resize((dot_w, dot_h), Image.Resampling.BOX)
    work = np.asarray(picture).astype(np.float64) / 255.0
    bits = np.zeros_like(work, dtype=np.uint8)
    height, width = work.shape
    for y in range(height):
        for x in range(width):
            bit = 1 if work[y, x] >= 0.5 else 0
            bits[y, x] = bit
            err = work[y, x] - bit
            if x + 1 < width:
                work[y, x + 1] += err * 7 / 16
            if y + 1 < height:
                if x > 0:
                    work[y + 1, x - 1] += err * 3 / 16
                work[y + 1, x] += err * 5 / 16
                if x + 1 < width:
                    work[y + 1, x + 1] += err * 1 / 16
    return bits


def pack(bits: np.ndarray) -> list[str]:
    height, width = bits.shape
    lines = []
    for y in range(0, height, 4):
        chars = []
        for x in range(0, width, 2):
            code = 0
            for dy, dx, bit in DOTS:
                if y + dy < height and x + dx < width and bits[y + dy, x + dx]:
                    code |= bit
            chars.append(" " if code == 0 else chr(0x2800 + code))
        lines.append("".join(chars))
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def braille(ink: np.ndarray, cols: int) -> list[str]:
    return pack(floyd_bits(ink, cols))


def paste(target: np.ndarray, source: np.ndarray, left: int, top: int) -> None:
    height, width = source.shape
    th, tw = target.shape
    y0, x0 = max(0, top), max(0, left)
    y1, x1 = min(th, top + height), min(tw, left + width)
    if y1 <= y0 or x1 <= x0:
        return
    target[y0:y1, x0:x1] = np.maximum(
        target[y0:y1, x0:x1],
        source[y0 - top : y1 - top, x0 - left : x1 - left],
    )


def outline_plate(hands: np.ndarray, gear: np.ndarray, screw: np.ndarray) -> list[str]:
    """Circle and square, with the three studies set inside. After the Vitruvian sheet."""
    cols, rows = 72, 36
    dot_w, dot_h = cols * 2, rows * 4
    bits = np.zeros((dot_h, dot_w), dtype=np.uint8)
    cx, cy = (dot_w - 1) / 2, (dot_h - 1) / 2
    # Dot pitch is a little wider than tall in a mono cell, so the circle
    # is drawn taller in dots and looks round on the page.
    ry, rx = 66, 56
    yy, xx = np.ogrid[:dot_h, :dot_w]
    circle = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    on_circle = (circle > 0.96) & (circle < 1.045)
    half_x, half_y = 50, 58
    on_square = (
        (np.abs(np.abs(xx - cx) - half_x) <= 1.1) & (np.abs(yy - cy) <= half_y)
    ) | (
        (np.abs(np.abs(yy - cy) - half_y) <= 1.1) & (np.abs(xx - cx) <= half_x)
    )
    bits[on_square | on_circle] = 1

    # The small hands are cropped to the palms and the spark, so the
    # fingers stay large enough to read inside the circle.
    hand_h, hand_w = hands.shape
    hands_inset = hands[:, int(hand_w * 0.16) : int(hand_w * 0.84)]
    studies = []
    for ink, width in ((hands_inset, 20), (gear, 14), (screw, 15)):
        studies.append(floyd_bits(ink, width))
    gap = 4
    total = sum(block.shape[1] for block in studies) + gap * (len(studies) - 1)
    left = int(round(cx - total / 2))
    for block in studies:
        top = int(round(cy - block.shape[0] / 2))
        paste(bits, block, left, top)
        left += block.shape[1] + gap
    return pack(bits)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    adam = fetch("adam")
    screw = fetch("screw")
    gears = fetch("gears")

    pair = hands_pair(adam)
    screw_ink = stroke_ink(rel_crop(screw, (0.01, 0.0, 0.99, 0.40)), 91, 3, 4)
    gear_ink = stroke_ink(rel_crop(gears, (0.31, 0.30, 0.76, 0.68)), 92, 3, 5)

    plates = {
        "fig1": outline_plate(pair, gear_ink, screw_ink),
        "fig2": braille(pair, 72),
        "fig3": braille(gear_ink, 64),
        "fig4": braille(screw_ink, 68),
    }
    for name, lines in plates.items():
        text = "\n".join(lines)
        (OUT / f"{name}.txt").write_text(text + "\n", encoding="utf-8")
        width = max(len(line) for line in lines)
        print(f"{name}: {width} x {len(lines)}")


if __name__ == "__main__":
    main()
