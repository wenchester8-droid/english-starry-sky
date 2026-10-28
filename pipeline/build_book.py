"""把 parse_vocab.py 解析出的词表清洗成网页用的 public/data/7a.json。

用法: python build_book.py 解析结果.json 输出.json（文件名就是册号：7a.json、8a.json） [对齐结果.json] [词光素材对照.json]
对齐结果（align_audio.py 产出）存在时，给每个词条写上 audio 路径；
词光素材对照（fetch_word_atlas.py 产出）存在时，加上插画、美音和例句。
"""
import json, os, re, sys

src, out = sys.argv[1], sys.argv[2]
BOOK = os.path.splitext(os.path.basename(out))[0]  # 7a.json → 7a
align = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
atlas = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}

# 默认不背的人名；国家、城市、节日、食物等保留在学习范围里
PLACES = {"UK", "US", "Australia", "Sydney", "Singapore", "London", "Ireland", "Canada", "Helsinki", "Finland",
          "Russia", "Scotland", "France", "Thanksgiving",
          "Europe", "Poland", "Greece", "Atlantic Ocean", "Equatorial Guinea", "Lhasa", "Vienna", "Oakland", "Mombasa",
          # 七下
          "Antarctica", "Africa", "Thailand", "New York", "Kenya", "USA", "Central Park", "Mount Huangshan", "Bright Peak",
          # 八下
          "India", "Mogao Caves", "Nile River", "Angel Falls", "Mount Qomolangma", "Dead Sea", "Sahara Desert",
          "Mariana Trench", "Yangtze River", "Egypt", "Taklimakan Desert", "Mount Kilimanjaro", "Inga Falls",
          "Victoria Falls", "Siberia", "Lake Baikal", "Belgium", "Phuket", "Indonesia", "Japan", "Türkiye", "Mexico",
          "Peru", "Germany", "Argentina", "Philippines"}
NOT_PROPER = {"How about ...?", "Chinese chess", "play Chinese chess", "AM", "PM", "IT", "Mapo tofu",
              "Beijing roast duck", "the Great Wall", "National Day", "CPC Founding Day", "PLA Day",
              "Guest-Greeting Pine", "Gongbao chicken", "Dongpo pork", "Red Square", "Alexander Garden", "Moscow Metro", "AI",
              "the Olympics", "Nobel Prize", "Louvre Museum", "Tanggula Pass", "Proxima Centauri", "BCE", "CE"}


# 释义里带分号、规则认不出来的人名
PERSONS = {"Harry",
           # 七下、八下：三个词的人名
           "Hans Christian Andersen", "Frances Hodgson Burnett", "Ji-Hoon", "Kaito", "Sherlock Holmes", "Ernest Hemingway",
           # 九年级：译名超过 7 个字，规则认不出来
           "Isambard Brunel", "I. M. Pei", "Amelia Earhart", "Guglielmo Marconi", "Frédéric Chopin", "Eric Moussambani", "Terry"}


# 词光是雅思词库，这些词它收的义项和课本不同（bat 是蝙蝠、IT 被当成代词 it 等），不用它的图和例句
ATLAS_SKIP = {"bat", "it", "grade", "mind", "mean", "grow", "hall",
              # 八上：tear 是眼泪不是撕破、make up 是和好不是化妆品、clause 是从句、shoot 是嫩芽……
              "tear", "make-up", "clause", "shoot", "thanksgiving", "pass", "block", "store", "sick", "dead", "lift",
              "character", "sign", "line",
              # 九年级：bark 是树皮不是狗叫、Polish 是波兰的、tap 是打拍子不是水龙头、seed bank 不是银行……
              "live", "bark", "polish", "tape", "tap", "folk", "ease", "officer", "piece", "keyboard", "figure",
              "god", "lover", "launch", "movement", "bank"}


# 只对某一册生效（同一个词在别册词义可能是对的）
ATLAS_SKIP_BOOK = {
    # 七下：trunk 是象鼻、plant 是工厂、screen 是滤网、mount 是「山」、lie 是撒谎、match 是比赛不是火柴……
    "7b": {"trunk", "fit", "double", "chip", "sight", "mount", "plant", "screen", "entry", "lie", "set", "official", "match", "race"},
    # 八下：stroke 是笔画、present 是礼物、bow 是鞠躬、can 是罐头、pool 是水坑……
    "8b": {"stroke", "stage", "present", "ring", "power", "beat", "bow", "can", "primary", "pool", "state", "base"},
}


TITLES = {"7a": "人教版 七年级上册", "7b": "人教版 七年级下册", "8a": "人教版 八年级上册", "8b": "人教版 八年级下册", "9": "人教版 九年级"}


def cjk_tidy(s: str) -> str:
    s = re.sub(r"(?<=[\u3000-\u9fff\uff09\uff1b\uff0c\u3002\u00b7])\s+(?=[\u3000-\u9fff\uff08\u00b7])", "", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(w: str) -> str:
    s = re.sub(r"\(.*?\)", "", w).lower().replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "x"


def clean(e: dict) -> dict:
    w, pos, zh, note = e["w"], e["pos"], cjk_tidy(e["zh"]), ""
    # 七下、八下：中文里带字母的「T恤衫」「X射线」被拆错；书名号《被分到英文那边
    m = re.match(r"^(T-shirt|X-ray) n\. ([A-Z])$", w)
    if m:
        w, pos, zh = m.group(1), "n.", m.group(2) + zh
    # 八下：「spoiled adj. (= spoilt )」「since prep., adv. & conj.」「prove v. (proved, proved 或 proved, proven …) 证明」
    m = re.match(r"^(spoiled) (adj\.) (\(=.*\))$", w)
    if m:
        w, pos, note = m.group(1), m.group(2), m.group(3).replace(" )", ")")
        return {"w": w, "ipa": e["ipa"], "pos": pos, "zh": zh, "note": note, "key": e["key"], "proper": False, "page": e["page"]}
    if w == "since prep.,":
        w, pos = "since", "prep., " + pos
    m = re.match(r"^(prove) v\. \((.*)$", w)
    if m:
        extra, zh2 = re.match(r"^(.*?\))\s*(.*)$", zh).groups()
        w, pos, zh, note = "prove", "v.", zh2, f"({m.group(2)} {extra}"
        return {"w": w, "ipa": e["ipa"], "pos": pos, "zh": zh, "note": note, "key": e["key"], "proper": False, "page": e["page"]}
    if w.endswith(" 《"):
        w, zh = w[:-2].strip(), "《" + zh
    if w.endswith(" ……") and zh.startswith("怎么样"):  # "What about …? …… 怎么样？"
        w, zh = w[:-3].strip(), "……" + zh
    # "grandchild n. (pl. grandchildren )"、"gym n. (= gymnasium )"、"kilo (= kilogram, kilogramme ) n. (pl. kilos)"
    m = re.match(r"^(.*?)\s+(n\.)\s*(\(.*\))\s*$", w)
    if m:
        w, pos, note = m.group(1), m.group(2), m.group(3)
    m = re.match(r"^(.*?)\s*(\(=.*?\))\s*$", w)
    if m and not note.startswith("(="):
        w, eq = m.group(1), m.group(2)
        note = f"{eq} {note}".strip()
    # 八上："forget v. (forgot )"、"shall modal v. (should )"、"yourself pron. (pl. yourselves )"、"everywhere adv.,"
    m = re.match(r"^([A-Za-z]+) ((?:modal )?v\.|pron\.|adv\.,?)\s*(\(.*\))?\s*$", w)
    if m:
        w, note = m.group(1), (m.group(3) or "")
        pos = m.group(2).rstrip(",") + (f", {pos}" if pos else "")
    if w.endswith(" ……") and zh.startswith("好吗"):  # "Shall I / we …? …… 好吗？"
        w, zh = w[:-3].strip(), "……" + zh
    if w.startswith("How about"):
        w, zh = "How about ...?", "……怎么样？"
    if w == "goose":
        pos, note = "n.", "(pl. geese)"
    note = re.sub(r"\s+([,)])", r"\1", note)
    name_like = not pos and re.fullmatch(r"[一-鿿·]{1,7}", zh) and w[:1].isupper() and len(w.split()) <= 2
    title = zh.startswith("《")
    proper = title or w in PERSONS or bool(name_like or w in ("PRC", "PLA", "VR", "WHO", "UN")) and w not in PLACES and w not in NOT_PROPER
    return {"w": w.strip(), "ipa": e["ipa"], "pos": pos, "zh": zh, "note": note, "key": e["key"], "proper": proper, "page": e["page"]}


units, seen = [], set()
raw = json.load(open(src))
common = {slug(clean(e)["w"]) for u in raw for e in u["words"] if not clean(e)["proper"]}
for ui, u in enumerate(raw):
    uid = slug(u["unit"])
    words = []
    for e in u["words"]:
        c = clean(e)
        wid = slug(c["w"])
        if wid in seen or (c["proper"] and wid in common):
            # 重名时起个看得懂的 id（插画文件名要用）：mm(=millimetre) → millimetre，face-to-face adj. → face-to-face-adj，人名 Rose → rose-name
            eq = re.match(r"\(=\s*([^;)]+)", c.get("note", ""))
            wid = slug(eq.group(1)) if eq else f"{wid}-name" if c["proper"] else f"{wid}-{slug(c['pos'].split('.')[0])}" if c["pos"] else wid
        while wid in seen:
            wid += "-2"
        seen.add(wid)
        c = {"id": wid, **c}
        if not c["note"]:
            del c["note"]
        a = align.get(f"{uid}/{len(words)}")
        if a:
            c["audio"] = f"audio/{BOOK}/{wid}.mp3"
        extra = None if wid in ATLAS_SKIP or wid in ATLAS_SKIP_BOOK.get(BOOK, ()) else atlas.get(wid)
        if extra:
            for k in ("img", "us", "ex", "exAudio"):
                if k in extra:
                    c[k] = extra[k]
        words.append(c)
    units.append({"id": uid, "title": u["unit"], "words": words})

json.dump({"id": BOOK, "title": TITLES[BOOK], "units": units}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
print(sum(len(u["words"]) for u in units), "words;", sum(w["proper"] for u in units for w in u["words"]), "proper;",
      sum("audio" in w for u in units for w in u["words"]), "with audio;",
      sum("img" in w for u in units for w in u["words"]), "with picture")
