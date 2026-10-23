#!/usr/bin/env python3
"""Regenerates every logo asset under src/client/public from the two files the studio supplied.

    python3 scripts/make-brand.py <tiger-head.svg> <full-lockup.svg>

Needs Pillow (with WebP support) and numpy. The originals are not kept in the repo, and none of their
metadata (the emblem PNG carries a C2PA box) is carried into the outputs.
"""
import base64, io, re, struct, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "src/client/public"
BRAND = PUBLIC / "brand"
INK = (10, 10, 10)
GAIN = 2.0         # alpha = GAIN x brightest channel: the dim metallic shading stays solid, only the soft edge is translucent
FLOOR = 6 / 255    # the source "black" carries faint dither; anything below this is background
EMBLEM_WIDTHS = [48, 64, 96, 128, 192, 256, 384]
LOCKUP_WIDTHS = [320, 480, 640, 960]
LOSSLESS_UP_TO = 96
SMALL_ICON_THICKEN = {16: 8, 32: 6, 48: 6}  # favicon strokes are widened (in px of a 1024 master) so they survive at this size


def emblem_master(path):
    """Square canvas centred on the tiger, RGB over black."""
    png = re.search(r'href="data:image/png;base64,([^"]+)"', Path(path).read_text(encoding="utf-8")).group(1)
    full = Image.open(io.BytesIO(base64.b64decode(png))).convert("RGB")
    ys, xs = np.where(np.asarray(full).max(axis=2) > 16)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    side = max(x1 - x0, y1 - y0) + 40
    side += side % 2
    cx, cy = int(x0 + x1) // 2, int(y0 + y1) // 2
    return full.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2))


def lockup_master(path, scale=4):
    """Rasterises the traced paths (flat fills, even-odd, M and Z only) and crops to the artwork, RGB over black."""
    svg = Path(path).read_text(encoding="utf-8")
    w, h = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', svg).groups())
    canvas = np.zeros((h * scale, w * scale, 3), np.uint8)
    for fill, d in re.findall(r'<path\b[^>]*?fill="#([0-9a-fA-F]{6})"[^>]*?\sd="([^"]+)"', svg):
        mask = np.zeros(canvas.shape[:2], bool)
        for sub in d.split("M"):
            nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", sub)]
            pts = [(nums[i] * scale - 0.5, nums[i + 1] * scale - 0.5) for i in range(0, len(nums) - 1, 2)]
            if len(pts) < 3:
                continue
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            x0, y0 = max(int(min(xs)) - 2, 0), max(int(min(ys)) - 2, 0)
            x1, y1 = min(int(max(xs)) + 3, canvas.shape[1]), min(int(max(ys)) + 3, canvas.shape[0])
            part = Image.new("1", (x1 - x0, y1 - y0))
            ImageDraw.Draw(part).polygon([(x - x0, y - y0) for x, y in pts], fill=1)
            mask[y0:y1, x0:x1] ^= np.asarray(part, bool)
        canvas[mask] = [int(fill[i:i + 2], 16) for i in (0, 2, 4)]
    img = Image.fromarray(canvas)
    ys, xs = np.where(canvas.max(axis=2) > 16)
    pad = 24 * scale
    return img.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, img.width), min(ys.max() + pad, img.height)))


def cut_out(rgb):
    """Black to alpha: the pixels are the artwork premultiplied over black, so divide the alpha back out."""
    f = np.asarray(rgb).astype(np.float32) / 255
    m = f.max(axis=2)
    alpha = np.where(m < FLOOR, 0, np.minimum(1, m * GAIN))
    colour = np.where(alpha[..., None] > 0, f / np.maximum(alpha[..., None], 1e-6), 0)
    return Image.fromarray((np.dstack([np.clip(colour, 0, 1), alpha]) * 255 + 0.5).astype(np.uint8), "RGBA")


def scaled(rgb, width):
    return rgb.resize((width, round(width * rgb.height / rgb.width)), Image.LANCZOS)


def thicken(rgb, r):
    a = np.asarray(rgb)
    for axis in (0, 1):
        grown = a.copy()
        for s in range(1, r + 1):
            grown = np.maximum(grown, np.maximum(np.roll(a, s, axis), np.roll(a, -s, axis)))
        a = grown
    return Image.fromarray(a)


def save_webp(img, path, lossless):
    quality = {"lossless": True} if lossless else {"quality": 88, "alpha_quality": 100}
    img.save(path, "WEBP", method=6, exact=False, **quality)


def posterised(img):
    """The lockup is flat colour art: a 256 colour palette is visually lossless and half the bytes."""
    return img.quantize(256, Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")


def tile(emblem, size, inset, radius=0.22):
    """Black rounded tile (radius 0 for a full-bleed square) with the emblem centred at inset x tile size."""
    k = 4
    big = Image.new("RGBA", (size * k, size * k), (0, 0, 0, 0))
    ImageDraw.Draw(big).rounded_rectangle((0, 0, size * k - 1, size * k - 1), radius=size * k * radius, fill=INK + (255,))
    side = round(size * k * inset)
    mark = emblem.resize((side, side), Image.LANCZOS)
    big.alpha_composite(mark, ((size * k - side) // 2, (size * k - side) // 2))
    return big.resize((size, size), Image.LANCZOS)


def write_ico(path, frames):
    blobs = []
    for frame in frames:
        out = io.BytesIO()
        frame.save(out, "PNG", optimize=True)
        blobs.append(out.getvalue())
    head, offset = struct.pack("<HHH", 0, 1, len(frames)), 6 + 16 * len(frames)
    entries = b""
    for frame, blob in zip(frames, blobs):
        entries += struct.pack("<BBBBHHII", frame.width % 256, frame.height % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    Path(path).write_bytes(head + entries + b"".join(blobs))


def share_image(lockup_rgb):
    card = Image.new("RGBA", (1200, 630), INK + (255,))
    art = cut_out(scaled(lockup_rgb, 1020))
    card.alpha_composite(art, ((1200 - art.width) // 2, (630 - art.height) // 2))
    return card.convert("RGB").quantize(256, Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def main(tiger, lockup):
    BRAND.mkdir(parents=True, exist_ok=True)
    emblem, wordmark = emblem_master(tiger), lockup_master(lockup)
    for w in EMBLEM_WIDTHS:
        save_webp(cut_out(scaled(emblem, w)), BRAND / f"emblem-{w}.webp", w <= LOSSLESS_UP_TO)
    for w in LOCKUP_WIDTHS:
        save_webp(posterised(cut_out(scaled(wordmark, w))), BRAND / f"lockup-{w}.webp", True)
    big = emblem.resize((1024, 1024), Image.LANCZOS)
    mark = cut_out(big)
    small = {s: cut_out(thicken(big, r)) for s, r in SMALL_ICON_THICKEN.items()}
    write_ico(PUBLIC / "favicon.ico", [tile(small[s], s, 0.94 if s == 16 else 0.92, 0.2) for s in (16, 32, 48)])
    tile(small[32], 32, 0.92, 0.2).save(PUBLIC / "favicon-32.png", optimize=True)
    tile(mark, 180, 0.74, 0).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
    tile(mark, 192, 0.78).save(PUBLIC / "icon-192.png", optimize=True)
    tile(mark, 512, 0.78).save(PUBLIC / "icon-512.png", optimize=True)
    tile(mark, 512, 0.68, 0).convert("RGB").save(PUBLIC / "icon-maskable-512.png", optimize=True)
    share_image(wordmark).save(BRAND / "og.png", optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
