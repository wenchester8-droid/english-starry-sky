"""把七上课本词表（../app/public/data/7a.json）转成词光的数据格式，放到 public/atlas/。

- 词光的「难度」改成课本单元，「话题」改成词的类别（重点词 / 一般词 / 短语 / 地名与专名）
- 人名不进词库
- 课本原声放在 uk（英音）的位置；美音、插画、例句来自词光开源词库
- 老师自己生成的插画放在 ../插画/新图/<词条id>.png（jpg、webp 也行），优先使用；
  封面（hero、og、topic-key 等）同样放在那里，会转成 public/brand/ 里的同名 webp
用法: python scripts/build_atlas.py [ffmpeg路径] [册号，默认 7a]
七上输出到 public/atlas/，其他册输出到 public/atlas/<册号>/（例句来自 scripts/examples<册号>.json）。
"""
import glob, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
APP = os.path.join(os.path.dirname(WEB), "app", "public")
BOOK = sys.argv[2] if len(sys.argv) > 2 else "7a"
OUT = os.path.join(WEB, "public", "atlas", *([] if BOOK == "7a" else [BOOK]))
NEW_PICS = os.path.join(os.path.dirname(WEB), "插画", "新图")
# 美术老师没画、词光也没有的词，用代码画的补位图（scripts/make_fill_pics.py），老师的新图一到就被替换
FILL_PICS = os.path.join(os.path.dirname(WEB), "插画", "补位图")
FFMPEG = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
COVERS = {"hero": 1600, "og": 1600, "topic-key": 512, "topic-basic": 512, "topic-phrase": 512, "topic-name": 512}
# 词光插画和课本词义对不上的，等新图做好前先不显示（见 ../插画/插画生成清单.md）
WA_IMG_SKIP = {"unit", "centre", "field", "smart", "locker", "laugh", "term", "act", "language", "flag", "national"}
CHUNK = 100
MEDIA = {"img": 1, "uk": 2, "us": 4, "ex": 8, "ex2": 16}
# 例句：课本原句 + 中考水平句（老师可改 scripts/examples7a.json），录音由 build_example_audio.py 生成
EXAMPLES = json.load(open(os.path.join(HERE, f"examples{BOOK}.json")))
sys.path.insert(0, HERE)
from build_example_audio import cache_path  # noqa: E402
KINDS = [("key", "课标重点词"), ("basic", "一般词汇"), ("phrase", "短语"), ("name", "地名与专名")]

book = json.load(open(os.path.join(APP, "data", f"{BOOK}.json")))
NAMES = {"7a": "人教版七年级上册", "7b": "人教版七年级下册", "8a": "人教版八年级上册", "8b": "人教版八年级下册", "9": "人教版九年级"}
for sub in ("entries", "img", "thumb", "audio/uk", "audio/us", "audio/ex", "audio/ex2"):
    shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)


def senses(pos, zh):
    """课本释义里可能有好几个词性："n. 乐趣；快乐 adj. 有趣的" → 拆成多条。"""
    parts = re.split(r"\s+((?:n|v|adj|adv|pron|prep|conj|interj|num|art|modal v)\.(?:\s*&\s*(?:n|v|adj|adv|pron|prep|conj)\.)?)\s*", " " + zh)
    out = [{"pos": pos, "zh": parts[0].strip(), "en": ""}]
    for i in range(1, len(parts) - 1, 2):
        out.append({"pos": parts[i], "zh": parts[i + 1].strip(), "en": ""})
    return [s for s in out if s["zh"]]


def new_pic(name):
    hits = [f for f in glob.glob(os.path.join(NEW_PICS, name + ".*")) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
    return hits[0] if hits else None


def to_webp(src, dst, size, square=True):
    vf = f"scale={size}:{size}:force_original_aspect_ratio=increase,crop={size}:{size}" if square else f"scale={size}:-2"
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", vf, "-quality", "82", dst], check=True)


def copy(src, dst):
    src = os.path.join(APP, src)
    if os.path.exists(src):
        shutil.copyfile(src, os.path.join(OUT, dst))
        return True
    return False


rows, entries = [], []
for ui, u in enumerate(book["units"]):
    for w in u["words"]:
        if w["proper"]:  # 人名不背
            continue
        phrase = " " in w["w"].strip() and not w["w"][:1].isupper()
        kind = 3 if (w["w"][:1].isupper() and not w["pos"]) else 2 if phrase else 0 if w["key"] else 1
        m = 0
        mine = new_pic(w["id"])
        if mine:
            to_webp(mine, os.path.join(OUT, "img", f"{w['id']}.webp"), 512)
            to_webp(mine, os.path.join(OUT, "thumb", f"{w['id']}.webp"), 256)
            m |= MEDIA["img"]
        elif not (BOOK == "7a" and w["id"] in WA_IMG_SKIP) and w.get("img") and copy(w["img"].replace("wa/thumb/", "wa/img/"), f"img/{w['id']}.webp"):
            copy(w["img"], f"thumb/{w['id']}.webp")
            m |= MEDIA["img"]
        else:
            fill = next((f for f in (os.path.join(FILL_PICS, BOOK, w["id"] + ".png"), os.path.join(FILL_PICS, w["id"] + ".png")) if os.path.exists(f)), None)
            if fill:
                to_webp(fill, os.path.join(OUT, "img", f"{w['id']}.webp"), 512)
                to_webp(fill, os.path.join(OUT, "thumb", f"{w['id']}.webp"), 256)
                m |= MEDIA["img"]
        if w.get("audio") and copy(w["audio"], f"audio/uk/{w['id']}.mp3"):
            m |= MEDIA["uk"]
        if w.get("us") and copy(w["us"], f"audio/us/{w['id']}.mp3"):
            m |= MEDIA["us"]
        exs = []
        mine_ex = EXAMPLES.get(w["id"])
        if mine_ex:
            for slot, folder in (("tb", "ex"), ("zk", "ex2")):
                e = mine_ex[slot]
                exs.append({"en": e["en"], "zh": e["zh"], "src": e["src"]})
                audio = cache_path(slot, w["id"], e["en"])
                if os.path.exists(audio):
                    shutil.copyfile(audio, os.path.join(OUT, "audio", folder, f"{w['id']}.mp3"))
                    m |= MEDIA[folder]
        ss = senses(w["pos"], w["zh"])
        zh = "；".join(f"{s['pos']} {s['zh']}".strip() for s in ss)
        rows.append([w["id"], w["w"], zh, w["ipa"], ui, kind, m])
        entries.append({
            "id": w["id"], "w": w["w"], "uk": w["ipa"], "us": "", "senses": ss,
            "ex": exs, "col": [], "fam": [], "syn": [], "ant": [],
            "tip": w.get("note", ""), "cefr": u["title"], "topic": KINDS[kind][0], "m": m,
            "page": w["page"], "key": w["key"], "unit": u["id"],
        })

for n in range(0, len(entries), CHUNK):
    json.dump(entries[n:n + CHUNK], open(os.path.join(OUT, "entries", f"{n // CHUNK}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
index = {
    "id": f"pep-{BOOK}", "version": 1, "name": NAMES[BOOK],
    "license": "课本词表与录音仅供本班学习；插画、美音、例句 CC BY 4.0 Word Atlas contributors",
    "count": len(rows), "examples": sum(len(e["ex"]) for e in entries),
    "illustrated": sum(1 for r in rows if r[6] & 1), "voiced": sum(1 for r in rows if r[6] & 2),
    "chunk": CHUNK, "topics": [list(k) for k in KINDS], "cefr": [u["title"] for u in book["units"]],
    "fields": ["id", "word", "zh", "ipa", "unit", "kind", "media"], "words": rows,
}
json.dump(index, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
covers = 0
for name, size in (COVERS.items() if BOOK == "7a" else []):
    mine = new_pic(name)
    if mine:
        to_webp(mine, os.path.join(WEB, "public", "brand", f"{name}.webp"), size, square=name.startswith("topic"))
        covers += 1
mine_n = sum(1 for r in rows if new_pic(r[0]))
print(f"其中 {mine_n} 张是老师新做的插画，替换了 {covers} 张封面")
print(f"{len(rows)} 个词条，{index['illustrated']} 个有插画，{index['voiced']} 个有课本原声")
