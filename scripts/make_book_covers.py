"""用代码画册数封面（翻书过场用），不用课本原封面。

用法: python3 scripts/make_book_covers.py ffmpeg路径 [输出文件夹，默认 public/brand]
输出 book-7a.webp … book-9.webp（480×678）。需要 Google Chrome（无界面截图）。
"""
import os, subprocess, sys, tempfile

FFMPEG = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(HERE), "public", "brand")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 480, 678
# 册号、年级、上下册、主色、点缀色
BOOKS = [("7a", "七年级", "上册", "#2E5E8C", "#E3B65A"), ("7b", "七年级", "下册", "#3E7A5E", "#EAC27A"),
         ("8a", "八年级", "上册", "#8C4A3A", "#E7CF9A"), ("8b", "八年级", "下册", "#5A4A8C", "#E3B65A"),
         ("9", "九年级", "全一册", "#1E2640", "#D9825F")]


def cover(grade, term, main, accent):
    stars = "".join(
        f'<circle cx="{(i * 97) % W}" cy="{(i * 53) % 330 + 20}" r="{1 + i % 3 * 0.6}" fill="#fff" opacity="{0.35 + (i % 4) * 0.15}"/>'
        for i in range(1, 40))
    return f'''<div style="position:relative;float:left;width:{W}px;height:{H}px;overflow:hidden;background:{main}">
<svg width="{W}" height="{H}" style="position:absolute;inset:0">{stars}
<circle cx="380" cy="120" r="54" fill="{accent}" opacity=".9"/>
<path d="M0 470 Q120 400 240 450 T480 430 V678 H0Z" fill="#fff" opacity=".10"/>
<path d="M0 520 Q140 470 260 510 T480 500 V678 H0Z" fill="#fff" opacity=".14"/></svg>
<div style="position:absolute;left:40px;top:150px;color:#fff;font-family:'Songti SC','STSong',serif">
<div style="font-size:26px;letter-spacing:.3em;opacity:.85">英语星空</div>
<div style="font-size:88px;font-weight:700;line-height:1.1;margin-top:18px">英语</div>
<div style="font-size:18px;letter-spacing:.35em;opacity:.8;font-family:Georgia,serif">ENGLISH</div></div>
<div style="position:absolute;left:40px;bottom:70px;color:#fff;font-family:'Songti SC','STSong',serif">
<div style="font-size:44px;font-weight:700">{grade}</div><div style="font-size:30px;margin-top:6px;opacity:.9">{term}</div></div>
<div style="position:absolute;right:0;top:0;bottom:0;width:18px;background:{accent};opacity:.85"></div></div>'''


page = f"<html><head><meta charset=utf-8><style>*{{margin:0;padding:0}}body{{width:{W * len(BOOKS)}px}}</style></head><body>" + "".join(cover(*b[1:]) for b in BOOKS) + "</body></html>"
with tempfile.TemporaryDirectory() as tmp:
    f, shot = os.path.join(tmp, "c.html"), os.path.join(tmp, "c.png")
    open(f, "w", encoding="utf-8").write(page)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--user-data-dir={tmp}/u", f"--window-size={W * len(BOOKS)},{H}", f"--screenshot={shot}", f"file://{f}"],
                   capture_output=True, check=True)
    os.makedirs(OUT, exist_ok=True)
    for i, b in enumerate(BOOKS):
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", shot, "-vf", f"crop={W}:{H}:{i * W}:0",
                        "-quality", "85", os.path.join(OUT, f"book-{b[0]}.webp")], check=True)
print("封面已输出到", OUT)
