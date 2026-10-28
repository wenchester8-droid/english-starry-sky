"""成就徽章的中心图案：插画/徽章/中心图案/<系列>.webp|png → web/public/badges/<系列>.webp

AI 生成的图是白底贴纸，这里把外面一圈白底变透明（从四边往里漫，只去掉和边连着的白色，
贴纸自己的白描边保留），去掉角落的小水印等零碎，裁到图案大小、补成正方形，缩到 256 存成 webp。
用法：python3 scripts/build_badges.py        （全部）
      python3 scripts/build_badges.py streak  （只处理这几个）
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "插画" / "徽章" / "中心图案"
OUT = ROOT / "web" / "public" / "badges"
SIZE = 256
WHITE = 232  # 三个通道都高于这个值算「白底」


def flood_background(rgb: np.ndarray) -> np.ndarray:
    """从四边开始，把连着的近白色像素标成背景。"""
    h, w, _ = rgb.shape
    white = (rgb >= WHITE).all(axis=2)
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if white[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def keep_main(fg: np.ndarray) -> np.ndarray:
    """只留主体和不太小的零件（星星、音符），去掉水印这类小碎块。"""
    h, w = fg.shape
    label = np.zeros((h, w), np.int32)
    sizes = [0]
    n = 0
    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and not label[sy, sx]:
                n += 1
                label[sy, sx] = n
                q = deque([(sy, sx)])
                count = 0
                while q:
                    y, x = q.popleft()
                    count += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not label[ny, nx]:
                            label[ny, nx] = n
                            q.append((ny, nx))
                sizes.append(count)
    if n == 0:
        return fg
    big = max(sizes)
    keep = np.array([s >= big * 0.02 for s in sizes])
    keep[0] = False
    return keep[label]


def build(src: Path) -> Path:
    im = Image.open(src).convert("RGB")
    # 先缩到 512 再算，快很多
    im.thumbnail((512, 512), Image.LANCZOS)
    rgb = np.asarray(im)
    fg = keep_main(~flood_background(rgb))
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    rgba = im.copy()
    rgba.putalpha(alpha)
    ys, xs = np.nonzero(fg)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    rgba = rgba.crop(box)
    side = max(rgba.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{src.stem}.webp"
    sq.save(dst, "WEBP", quality=88, method=6)
    return dst


def main():
    want = set(sys.argv[1:])
    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg"))
    for p in files:
        if want and p.stem not in want:
            continue
        dst = build(p)
        print(f"{p.name} → {dst.relative_to(ROOT)} ({dst.stat().st_size // 1024} KB)")
    # 网页里哪些系列有图片，自动写进代码（没有图的系列继续用线条图标）
    ids = sorted(p.stem for p in OUT.glob("*.webp"))
    (ROOT / "web" / "src" / "ui" / "badgeEmblems.ts").write_text(
        "/** 由 scripts/build_badges.py 自动生成：public/badges/ 里有中心图案的系列 */\n"
        f"export const EMBLEM_IDS: string[] = {ids!r};\n".replace("'", '"'),
        encoding="utf-8",
    )
    print(f"有图的系列 {len(ids)} 个")


if __name__ == "__main__":
    main()
