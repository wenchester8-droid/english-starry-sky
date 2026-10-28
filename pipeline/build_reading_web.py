"""生成网页「挑战模式 · 真题阅读馆」的数据：web/public/data/reading.json，图片放 web/public/reading/。

只收老师核对过答案的文章（build/ai_answers.json 里 reviewed 的）和有官方答案的河南中考。
每篇文章算好「七上学生不认识的词」（cand）：网页再按每个学生学过的词（八上、九年级单词）实时扣掉，得到他的生词数。
课本词表以外的词取开源词库「词光」的中文释义（build/wordatlas_index.json，CC BY 4.0），少数常用词在 EXTRA_ZH 里手写。

先跑 parse_papers.py，再跑本脚本。
用法: python build_reading_web.py
"""
import json, os, re, shutil

from reading_common import HERE, ROOT, TIERS, book_words, lemmas, tokens

WEB = os.path.join(ROOT, "web", "public")
OUT = os.path.join(WEB, "data", "reading.json")
IMG_SRC = os.path.join(HERE, "build", "reading_img")
IMG_OUT = os.path.join(WEB, "reading")

# 词光里没有、文章里又常见的词
EXTRA_ZH = {
    "himself": "他自己", "herself": "她自己", "itself": "它自己", "themselves": "他们自己", "ourselves": "我们自己",
    "yourself": "你自己", "myself": "我自己", "whether": "是否", "deep": "深的", "mine": "我的（东西）",
    "neighbor": "邻居", "outgoing": "外向的", "overcome": "克服", "unhappiness": "不快乐", "storybook": "故事书",
    "bookmark": "书签", "bully": "欺负", "punctuation": "标点符号", "villager": "村民", "handwritten": "手写的",
    "sticker": "贴纸", "crayon": "蜡笔", "storyteller": "讲故事的人", "paintbrush": "画笔", "reuse": "重复使用",
    "encouragement": "鼓励", "creativity": "创造力", "schoolwork": "功课", "junk": "垃圾；没用的东西",
    "educational": "教育的", "laziness": "懒惰", "punishment": "惩罚", "honesty": "诚实", "mission": "任务；使命",
    "teen": "青少年", "packed": "挤满的", "heal": "治愈", "priceless": "无价的", "photographer": "摄影师",
    "homeroom": "班级活动室", "takeaway": "外卖", "planner": "计划本；做计划的人", "flash": "闪光灯；闪光",
}

ZH = {}
for r in json.load(open(os.path.join(HERE, "build", "wordatlas_index.json")))["words"]:
    ZH.setdefault(r[1].lower(), r[2])
ZH.update(EXTRA_ZH)

# 八上、九年级单词：词 → 网页里的词条 id（七上的词算学生本来就认识）
VOCAB = {}
for b in ("8a", "9"):
    for r in json.load(open(os.path.join(WEB, "atlas", b, "index.json")))["words"]:
        if " " not in r[1]:
            VOCAB.setdefault(r[1].lower(), r[0])

BASE = TIERS["7a"]

# 每个生词最早出现在哪一册课本里（词表或课本全文）：1 七下、2 八上、3 八下、4 九年级，9 = 课本里都没有。
# 网页里学生选了哪一册，前面各册的词就算学过（七下、八下还没做进网页，用课本 PDF 全文判断）
def _text_words(name):
    return {t.lower() for t in tokens(open(os.path.join(HERE, "build", name)).read())}

LEVELS = [
    (1, _text_words("book7b_full.txt")),
    (2, book_words("8a", "book8a_full.txt")),
    (3, _text_words("book8b_full.txt")),
    (4, book_words("9", "book9_full.txt")),
]

def first_book(ls):
    return next((lv for lv, ws in LEVELS if any(x in ws for x in ls)), 9)
SENT_END = re.compile(r"[.!?]")
WORD = re.compile(r"[A-Za-z]+(?:['’][a-z]+)?|[.!?]")


def candidates(body):
    """文章里七上学生不认识的词：[关键词, 词条 id 或 null, 中文或 null, 出现次数, 原文里的各种写法, 最早出现在第几册]"""
    text = " ".join(body)
    glossed = {w.lower() for w in re.findall(r"([A-Za-z]+)\s*[（(][^)）]*[一-鿿][^)）]*[)）]", text)}
    lower_seen = {t.lower() for t in tokens(text) if t[0].islower()}
    cand, total, sent_start = {}, 0, True
    for m in WORD.finditer(text):
        t = m.group(0)
        if t in ".!?":
            sent_start = True
            continue
        total += 1
        w = t.replace("’", "'")
        low = w.lower()
        ls = lemmas(w)
        if low in glossed or any(x in BASE for x in ls):
            sent_start = False
            continue
        if w[0].isupper() and len(w) > 1 and (not sent_start or low not in lower_seen):
            sent_start = False
            continue  # 人名地名
        sent_start = False
        vid = next((VOCAB[x] for x in sorted(ls) if x in VOCAB), None)
        key = vid or next((x for x in sorted(ls, key=len) if x in ZH), low)
        zh = None if vid else ZH.get(key)
        c = cand.setdefault(key, [key, vid, zh, 0, [], first_book(ls)])
        c[3] += 1
        if low not in c[4]:
            c[4].append(low)
    return list(cand.values()), total


def fix_img(s, used):
    def rep(m):
        used.add(m.group(1))
        return f"[图:reading/{m.group(1)}]"
    return re.sub(r"\[图:([^\]]+)\]", rep, s)


def short_src(title, kind, year=None):
    if kind == "中考真题" and year:
        return f"{year}年河南中考"
    t = re.sub(r"（[^）]*）|\([^)]*\)", "", title)
    t = re.sub(r"_.*$", "", t)  # 七年级卷的文件名：「…月检测_七年级英语第三次月考卷」
    t = t.replace("河南省", "").replace("河南", "").replace("英语试题", "").replace("英语试卷", "").replace("英语", "").strip()
    return t[:26]


def main():
    papers = json.load(open(os.path.join(HERE, "build", "papers_reading.json")))
    answers = json.load(open(os.path.join(HERE, "build", "ai_answers.json")))
    # 解析：{文章 id: {题号或空格号: {ev: 原文依据（必须逐字在正文里）, why: 为什么}}}，答错才在网页里显示
    expl = json.load(open(os.path.join(HERE, "build", "explanations.json")))
    bad_ev = []
    out, used, dropped = [], set(), 0
    for p in papers:
        official = p["answered"] and p["kind"] == "中考真题"
        ai = answers.get(p["id"])
        if not official and not (ai and ai.get("reviewed")):
            continue
        qs = []
        for q in p["questions"]:
            opts = [[k, fix_img(v, used)] for k, v in sorted(q["options"].items())]
            if q["no"]:
                a = q.get("answer") if official else ai["ans"].get(str(q["no"]))
                if not a:
                    dropped += 1  # 扫描件里图表没拆出来的题，无法作答，不上线
                    continue
                qs.append({"n": q["no"], "stem": fix_img(q["stem"], used), "opts": opts, "ans": a})
            else:
                src = q.get("answers") if official else {str(n): ai["ans"].get(str(n)) for n in q["blanks"]}
                ans = {str(k): v for k, v in (src or {}).items() if v}
                if len(ans) < len(q["blanks"]):
                    dropped += len(q["blanks"]) - len(ans)
                    continue
                qs.append({"six": True, "blanks": q["blanks"], "opts": opts, "ans": ans})
        if not qs:
            continue
        ex = expl.get(p["id"], {})
        if ex:
            text = "\n".join(p["body"])
            for k, e in ex.items():
                if e.get("ev") and e["ev"] not in text:
                    bad_ev.append(f"{p['id']} 第{k}题")
            for q in qs:
                if q.get("six"):
                    q["ex"] = {str(b): ex[str(b)] for b in q["blanks"] if str(b) in ex}
                elif str(q["n"]) in ex:
                    q["ex"] = ex[str(q["n"])]
        # 去掉卷面上的「（10分）」、题目说明残句（没有英文、也没有图的行）
        lines = [re.sub(r"^\s*[（(]\s*\d+\s*分\s*[)）]\s*", "", l) for l in p["body"]]
        lines = [l for l in lines if re.search(r"[A-Za-z]|_{3,}|[（(]\s*\d{1,2}\s*[)）]|^[\s•●·▲★☆◆■]*\d{1,2}\s*$", l) or "[图:" in l]
        body = [fix_img(l, used) for l in lines]
        plain = [re.sub(r"\[图:[^\]]*\]", " ", l) for l in lines]
        cand, total = candidates(plain)
        first = re.sub(r"\s+", " ", " ".join(plain)).strip()
        m = SENT_END.search(first, 20)
        title = first[: (m.end() if m and m.end() < 70 else 60)].strip()
        out.append({
            "id": p["id"],
            "src": short_src(p["paper"], p["kind"], p["year"]),
            "kind": p["kind"],
            "year": p["year"],
            "title": title,
            "words": total,
            "body": body,
            "qs": qs,
            "cand": cand,
            "ai": not official,
        })
    if os.path.isdir(IMG_OUT):
        shutil.rmtree(IMG_OUT)
    for rel in used:
        src = os.path.join(IMG_SRC, rel)
        if os.path.exists(src):
            os.makedirs(os.path.dirname(os.path.join(IMG_OUT, rel)), exist_ok=True)
            shutil.copy(src, os.path.join(IMG_OUT, rel))
    json.dump({"version": 1, "articles": out}, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    nz = sum(1 for a in out for c in a["cand"] if not c[1] and not c[2])
    nex = sum(1 for a in out for q in a["qs"] for _ in ([1] if not q.get("six") and q.get("ex") else (q.get("ex") or {}).keys() if q.get("six") else []))
    print(f"有解析的题 {nex} 道")
    if bad_ev:
        print("原文依据在正文里找不到：", bad_ev)
    print(f"文章 {len(out)} 篇，题目 {sum(len(a['qs']) for a in out)} 组，去掉无法作答的 {dropped} 题，图片 {len(used)} 张，没中文的生词 {nz} 个")
    print(f"{OUT}  {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
