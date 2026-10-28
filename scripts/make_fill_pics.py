"""给还没有插画的词条，用代码画一张「补位图」：暖色纸底 + 大圆 + 地平线 + 开源表情图（Google Noto Emoji，Apache 2.0）。

美术老师的新图（插画/新图/）和词光插画都优先；只有这两样都没有的词才用补位图。
以后画了新图放进 插画/新图/，重跑 build_atlas.py 就会自动替换掉补位图。

用法: python3 scripts/make_fill_pics.py [ffmpeg路径]
  读 scripts/fill_pics.tsv（词条id <tab> 表情 <tab> 可选：第二个表情 <tab> 释义），
  不同册里同名的词（七下 sit-up 仰卧起坐、八下 sit up 坐直）写成「8b/sit-up」，图放在 补位图/8b/ 下，
  输出 ../插画/补位图/<词条id>.png（512×512）。表情找不到时画「中文释义」文字卡。
需要 Google Chrome（无界面截图）。已经画过的会跳过；删掉 png 就会重画。
"""
import html, json, os, subprocess, sys, tempfile, urllib.request, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ROOT = os.path.dirname(WEB)
OUT = os.path.join(ROOT, "插画", "补位图")
CACHE = os.path.join(HERE, "build", "noto")
FFMPEG = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TILE, COLS = 512, 4
# 和老师插画一样的配色：奶油底、芥末黄、陶土红、藏青、鼠尾草绿、天蓝
SCHEMES = [
    ("#F4EBDD", "#E3B65A", "#9DB38A"),
    ("#F3E9DA", "#D9825F", "#E7CF9A"),
    ("#EEF0E6", "#A9C2D6", "#9DB38A"),
    ("#F6EEDF", "#9DB38A", "#D9C08A"),
    ("#F2E8DB", "#EAC27A", "#C9876A"),
    ("#EFEDE4", "#C9876A", "#A7B9C9"),
]


def codepoints(emoji: str) -> str:
    cps = [f"{ord(c):x}" for c in emoji if ord(c) != 0xFE0F]
    return "_".join(cps)


def noto_svg(emoji: str):
    """下载 Noto 表情的 SVG（存在 build/noto/ 里，下次不再下载）。"""
    cp = codepoints(emoji)
    path = os.path.join(CACHE, f"{cp}.svg")
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        try:
            with urllib.request.urlopen(f"https://fonts.gstatic.com/s/e/notoemoji/latest/{cp}/emoji.svg", timeout=30) as r:
                open(path, "wb").write(r.read())
        except Exception:  # noqa: BLE001
            return None
    return open(path, encoding="utf-8").read()


def as_img(svg: str, size: int, x: float, y: float, rot=0) -> str:
    import base64
    data = base64.b64encode(svg.encode()).decode()
    return (f'<img src="data:image/svg+xml;base64,{data}" style="position:absolute;left:{x}px;top:{y}px;'
            f'width:{size}px;height:{size}px;transform:rotate({rot}deg);filter:drop-shadow(0 10px 0 rgba(30,38,64,.10))">')


def tile(wid: str, emojis: list, zh: str) -> str:
    h = zlib.crc32(wid.encode())
    paper, sun, hill = SCHEMES[h % len(SCHEMES)]
    sx, sy = 120 + h % 270, 70 + (h >> 8) % 60
    parts = [f'<div class="t" style="background:{paper}">',
             f'<div style="position:absolute;left:{sx}px;top:{sy}px;width:300px;height:300px;border-radius:50%;background:{sun};opacity:.55"></div>',
             f'<div style="position:absolute;left:-60px;right:-60px;top:380px;height:260px;border-radius:50% 50% 0 0;background:{hill};opacity:.75"></div>',
             '<div class="grain"></div>']
    svgs = [s for s in (noto_svg(e) for e in emojis) if s]
    if len(svgs) == 1:
        parts.append(as_img(svgs[0], 300, 106, 96))
    elif len(svgs) >= 2:
        parts.append(as_img(svgs[0], 250, 46, 120, -6))
        parts.append(as_img(svgs[1], 210, 260, 170, 6))
    else:  # 没有合适的表情：中文释义文字卡（不写英文，免得「看图选词」直接露出答案）
        fs = 112 if len(zh) <= 3 else 86 if len(zh) <= 5 else 64
        parts.append(f'<div class="zh" style="font-size:{fs}px">{html.escape(zh)}</div>')
    parts.append("</div>")
    return "".join(parts)


CSS = """*{margin:0;padding:0;box-sizing:border-box}body{width:%dpx;background:#fff}
.t{position:relative;float:left;width:512px;height:512px;overflow:hidden}
.grain{position:absolute;inset:0;opacity:.18;mix-blend-mode:multiply;background-image:radial-gradient(rgba(60,40,20,.5) .6px,transparent .8px);background-size:5px 5px}
.zh{position:absolute;left:40px;right:40px;top:180px;text-align:center;color:#1E2640;font-family:"Songti SC","STSong",serif;font-weight:700;line-height:1.2;
text-shadow:0 6px 0 rgba(30,38,64,.08)}"""


def short_zh(zh: str) -> str:
    """「n. 末尾；结束 v. ……」→「末尾」"""
    import re
    z = re.sub(r"^(?:(?:n|v|adj|adv|pron|prep|conj|interj|num|art|modal v)\.\s*(?:&\s*)?)+", "", zh.strip())
    z = re.split(r"[；;，,（(]", z)[0].strip()
    return z[:8] or zh[:8]


def main():
    rows = []
    for line in open(os.path.join(HERE, "fill_pics.tsv"), encoding="utf-8"):
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.rstrip("\n").split("\t")
        wid, emo, zh = cols[0], [c for c in cols[1:3] if c and c != "-"], cols[3] if len(cols) > 3 else ""
        if not os.path.exists(os.path.join(OUT, f"{wid}.png")):
            rows.append((wid, emo, short_zh(zh)))
    os.makedirs(OUT, exist_ok=True)
    per = COLS * COLS
    for n in range(0, len(rows), per):
        batch = rows[n:n + per]
        page = f"<html><head><meta charset=utf-8><style>{CSS % (TILE * COLS)}</style></head><body>" + "".join(tile(*r) for r in batch) + "</body></html>"
        with tempfile.TemporaryDirectory() as tmp:
            f = os.path.join(tmp, "p.html")
            shot = os.path.join(tmp, "p.png")
            open(f, "w", encoding="utf-8").write(page)
            rows_n = (len(batch) + COLS - 1) // COLS
            for attempt in range(4):  # Chrome 偶尔截图失败，换个临时用户目录重试
                r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                                    f"--user-data-dir={tmp}/u{attempt}", f"--window-size={TILE * COLS},{TILE * rows_n}",
                                    f"--screenshot={shot}", f"file://{f}"], capture_output=True)
                if r.returncode == 0 and os.path.exists(shot):
                    break
            else:
                raise RuntimeError("Chrome 截图失败：" + r.stderr.decode()[-300:])
            for i, (wid, _, _) in enumerate(batch):
                x, y = (i % COLS) * TILE, (i // COLS) * TILE
                os.makedirs(os.path.dirname(os.path.join(OUT, wid)), exist_ok=True)  # 「8b/sit-up」：只给某一册用的图
                subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", shot, "-vf", f"crop={TILE}:{TILE}:{x}:{y}",
                                os.path.join(OUT, f"{wid}.png")], check=True)
        print(min(n + per, len(rows)), "/", len(rows), flush=True)
    print("补位图共", len([f for f in os.listdir(OUT) if f.endswith(".png")]), "张")


if __name__ == "__main__":
    main()
