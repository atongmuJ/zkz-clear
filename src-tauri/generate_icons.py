"""Generate app icons for 张开嘴清理 from the supplied photo.

Run with: python3 generate_icons.py
Source image: app-icon-source.jpg (kept in this folder for reproducibility).
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
SOURCE = ROOT / "app-icon-source.jpg"
OUT = ROOT / "icons"
PUBLIC = ROOT.parent / "public" / "assets" / "images"

OUT.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)

source = Image.open(SOURCE).convert("RGB")


def square(size: int) -> Image.Image:
    # Crop around the person in the photo (head + red shirt), normalized so the
    # script still works if the source image is replaced at a different resolution.
    w, h = source.size
    cx, cy = w * 0.2491, h * 0.2031
    side = min(w * 0.2433, h * 0.3281)
    box = (
        round(cx - side / 2),
        round(cy - side / 2),
        round(cx + side / 2),
        round(cy + side / 2),
    )
    return source.crop(box).resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")


for name, size in [
    ("32x32.png", 32),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("icon.png", 512),
]:
    square(size).save(OUT / name)

square(256).save(
    OUT / "icon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

# Small copy used by the web UI (title bar, nav mark, browser favicon).
square(128).save(PUBLIC / "app-icon.png")

print("Icons written to", OUT, "and", PUBLIC / "app-icon.png")
