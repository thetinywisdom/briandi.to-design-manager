#!/usr/bin/env python3
"""Clean the Creation of Adam hands for the Fig 2 studies.

Not loaded by the page. From the repo root:

    python3 tools/prepare_hands.py

Downloads the public-domain fresco into tools/.cache and writes
variations/fig2/hands.png. Paper and plaster cracks are dropped.
Ink and shading stay. The two hands are cropped tight, the long
forearm is cut back, and the fingertips are shifted onto one row.
"""

from __future__ import annotations

import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tools" / ".cache"
OUT = ROOT / "variations" / "fig2" / "hands.png"
SRC = "https://upload.wikimedia.org/wikipedia/commons/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg"
UA = {"User-Agent": "briandi-portfolio-art/1.0 (notebook plates; local dev)"}

# Fractions of the fresco, then polygons in that crop (x, y in pixels
# of the crop). The outlines sit just outside the skin and stop the
# forearm so the two hands have a similar weight.
CROP = (0.322, 0.382, 0.472, 0.538)
LEFT = [
    (0, 18), (70, 22), (120, 40), (155, 68), (185, 98), (198, 118),
    (186, 136), (168, 128), (158, 155), (140, 178), (112, 176), (90, 160),
    (70, 168), (48, 150), (22, 122), (0, 104),
]
RIGHT = [
    (188, 112), (230, 98), (300, 92), (360, 80), (420, 64), (460, 50),
    (470, 100), (455, 132), (415, 150), (375, 162), (360, 195), (345, 222),
    (318, 214), (305, 180), (286, 214), (268, 198), (255, 160), (240, 132),
    (210, 120), (192, 116),
]


def fetch() -> Image.Image:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "adam.jpg"
    if not path.exists() or path.stat().st_size < 1000:
        request = urllib.request.Request(SRC, headers=UA)
        with urllib.request.urlopen(request, timeout=90) as response:
            path.write_bytes(response.read())
    return Image.open(path).convert("RGB")


def drop_specks(mask: np.ndarray, minimum: int) -> np.ndarray:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    keep = np.zeros_like(mask, dtype=bool)
    points = np.argwhere(mask)
    for y, x in points:
        y = int(y)
        x = int(x)
        if seen[y, x]:
            continue
        queue = deque([(y, x)])
        seen[y, x] = True
        blob = [(y, x)]
        while queue:
            cy, cx = queue.popleft()
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
                    blob.append((ny, nx))
        if len(blob) >= minimum:
            for by, bx in blob:
                keep[by, bx] = True
    return keep


def build(image: Image.Image) -> Image.Image:
    width, height = image.size
    left, top, right, bottom = CROP
    crop = image.crop(
        (int(left * width), int(top * height), int(right * width), int(bottom * height))
    )
    crop_w, crop_h = crop.size
    polygon = Image.new("L", (crop_w, crop_h), 0)
    draw = ImageDraw.Draw(polygon)
    draw.polygon(LEFT, fill=255)
    draw.polygon(RIGHT, fill=255)

    pixels = np.asarray(crop).astype(np.float32)
    luminance = 0.2126 * pixels[:, :, 0] + 0.7152 * pixels[:, :, 1] + 0.0722 * pixels[:, :, 2]
    background = np.asarray(
        Image.fromarray(luminance.astype(np.uint8)).filter(ImageFilter.GaussianBlur(16))
    ).astype(np.float32)
    detail = np.clip(background - luminance, 0, 255)
    inside = np.asarray(polygon) > 128
    skin = inside & (detail > 8)
    closed = Image.fromarray((skin.astype(np.uint8) * 255))
    closed = closed.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(5))
    skin = drop_specks(np.asarray(closed) > 128, 160)

    high = float(np.percentile(detail[skin], 92))
    shade = np.clip(detail / max(high, 1.0), 0, 1) ** 0.7
    tone = np.zeros((crop_h, crop_w), np.float32)
    tone[skin] = np.clip(0.40 + shade[skin] * 0.60, 0, 1)
    softened = np.asarray(
        Image.fromarray((tone * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.55))
    ).astype(np.float32) / 255
    tone = np.where(skin, np.clip(softened, 0.34, 1), 0)

    column = tone.sum(axis=0)
    gap = 170 + int(np.argmin(column[170:230]))
    leveled = np.zeros_like(tone)
    leveled[:, :gap] = tone[:, :gap]
    shift = 12
    rows = np.arange(crop_h)
    leveled[:, gap:] = tone[np.clip(rows - shift, 0, crop_h - 1)][:, gap:]
    leveled[:shift, gap:] = 0
    leveled[~drop_specks(leveled > 0.2, 500)] = 0

    ys, xs = np.where(leveled > 0.05)
    pad = 16
    plate = leveled[
        max(0, int(ys.min()) - pad) : min(crop_h, int(ys.max()) + 1 + pad),
        max(0, int(xs.min()) - pad) : min(crop_w, int(xs.max()) + 1 + pad),
    ]
    return Image.fromarray((np.clip(plate, 0, 1) * 255).astype(np.uint8), mode="L")


def main() -> None:
    plate = build(fetch())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    plate.save(OUT)
    print(f"wrote {OUT} {plate.size[0]}x{plate.size[1]}")


if __name__ == "__main__":
    main()
