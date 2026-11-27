"""Generate app icons for 张开嘴清理 (v1.0.0+).

3D Earth icon, composed from the same NASA Blue Marble render used by the
home page, so the app icon and the in-app globe share one visual language.

Run with: python3 src-tauri/generate_icons.py
Source: public/assets/images/earth.png (kept in repo for reproducibility).
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import io
import math
import random
import struct

ROOT = Path(__file__).parent
REPO = ROOT.parent
EARTH = REPO / "public" / "assets" / "images" / "earth.png"
OUT = ROOT / "icons"
PUBLIC = REPO / "public" / "assets" / "images"
MASTER_SIZE = 1024

OUT.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)


def radial_bg(size, inner=(20, 42, 74), outer=(5, 10, 22)):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    maxr = math.hypot(cx, cy)
    steps = 700
    for i in range(steps, 0, -1):
        f = i / steps
        c = tuple(int(inner[k] * (1 - f) + outer[k] * f) for k in range(3)) + (255,)
        r = maxr * f
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    return img


def circle_mask(size, cx, cy, r):
    s = size * 4
    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([(cx - r) * 4, (cy - r) * 4, (cx + r) * 4, (cy + r) * 4], fill=255)
    return m.resize((size, size), Image.Resampling.LANCZOS)


def stars(size):
    random.seed(7)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(46):
        x = random.randint(40, size - 40)
        y = random.randint(40, size - 40)
        r = random.choice([2, 2, 3, 4])
        a = random.randint(80, 190)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(190, 224, 255, a))
    return layer


def make_master():
    size = MASTER_SIZE
    cx = cy = size // 2
    bg = Image.alpha_composite(radial_bg(size), stars(size))

    earth = Image.open(EARTH).convert("RGBA")
    # 观测：球体中心约 (515, 517)，半径约 438（earth.png 为 1024×1024）
    ecx, ecy, er = 515, 517, 438
    earth.putalpha(circle_mask(earth.width, ecx, ecy, er))
    d = 760
    sphere = earth.crop((ecx - er, ecy - er, ecx + er, ecy + er))
    sphere = sphere.resize((d, d), Image.Resampling.LANCZOS)

    # 大气层辉光
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gr = d // 2 + 6
    gd.ellipse([cx - gr, cy - gr, cx + gr, cy + gr], outline=(70, 190, 255, 200), width=18)
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(24)))
    bg.alpha_composite(sphere, (cy - d // 2, cy - d // 2))
    return bg.convert("RGB")


master = make_master()
master.save(ROOT / "app-icon-source.jpg", quality=95)


def square(size):
    img = master.resize((size, size), Image.Resampling.LANCZOS)
    # 小尺寸下地球会显得偏暗、细节糊成一团，适度提亮 + 增强对比度，
    # 保证 16/32px 的任务栏、开始菜单图标依然能一眼认出是地球
    if size <= 64:
        img = ImageEnhance.Brightness(img).enhance(1.22 if size <= 32 else 1.12)
        img = ImageEnhance.Contrast(img).enhance(1.12)
    # Tauri 的 generate_context! 要求所有 PNG 图标都是 RGBA
    return img.convert("RGBA")


for name, size in [
    ("32x32.png", 32),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("icon.png", 512),
]:
    square(size).save(OUT / name)

def write_ico(path, sizes):
    """手工组装 ICO：每个尺寸独立渲染，避免 PIL 从 256 图缩放而丢失小尺寸提亮。"""
    images = []
    for s in sizes:
        buf = io.BytesIO()
        square(s).save(buf, format="PNG")
        images.append((s, buf.getvalue()))

    count = len(images)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = b""
    data = b""
    for s, png in images:
        dim = 0 if s == 256 else s
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
        data += png
    path.write_bytes(header + entries + data)


ico_sizes = [16, 32, 48, 64, 128, 256]
write_ico(OUT / "icon.ico", ico_sizes)

# 前端标题栏、导航栏、浏览器 favicon 使用的小图
square(128).save(PUBLIC / "app-icon.png")

# 免安装版资源目录同步图标
portable = REPO / "portable"
if portable.exists():
    write_ico(portable / "icon.ico", ico_sizes)

print("Icons written to", OUT, "and", PUBLIC / "app-icon.png")
