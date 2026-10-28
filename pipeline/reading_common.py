"""真题阅读的公用部分：分词、词形还原、「认识的词」三档（七上 / 学完八上 / 学完九年级）、生词统计。

认识的词 = 七上词表 + 七上课本全文 + 课文点读里出现过的所有词（八上、九年级同理叠加）。
括号里带中文注释的词（如 facilities (场所)）算认识；人名地名不算。
reading_pilot.py（统计分级）和 build_reading_web.py（生成网页数据）都用它。
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))

# ---------- 认识的词 ----------
def tokens(s):
    return re.findall(r"[A-Za-z]+(?:'[a-z]+)?", s.replace("’", "'"))

known = set()
book = json.load(open(os.path.join(ROOT, "app", "public", "data", "7a.json")))
for u in book["units"]:
    for w in u["words"]:
        for t in tokens(w["w"]):
            known.add(t.lower())
lessons = json.load(open(os.path.join(ROOT, "web", "public", "data", "7a-lessons.json")))
for u in lessons.values() if isinstance(lessons, dict) else lessons:
    for unit in (u if isinstance(u, list) else [u]):
        for les in unit["lessons"]:
            for l in les["lines"]:
                for t in tokens(l["t"]):
                    known.add(t.lower())
# 七上课本全文（swift 从 PDF 取的文字，含活动说明、词汇表附录）
for t in tokens(open(os.path.join(HERE, "build", "book7a_full.txt")).read()):
    known.add(t.lower())
known |= {"a", "an", "i", "s", "t", "ll", "re", "ve", "d", "m"}

def book_words(book_id, full_txt):
    ws = set()
    b = json.load(open(os.path.join(ROOT, "app", "public", "data", f"{book_id}.json")))
    for u in b["units"]:
        for w in u["words"]:
            ws |= {t.lower() for t in tokens(w["w"])}
    ws |= {t.lower() for t in tokens(open(os.path.join(HERE, "build", full_txt)).read())}
    return ws

# 三档：只学了七上 / 提前学完八上 / 提前学完九年级
TIERS = {"7a": known}
TIERS["8a"] = known | book_words("8a", "book8a_full.txt")
TIERS["9"] = TIERS["8a"] | book_words("9", "book9_full.txt")

IRREG = {
    "was": "be", "were": "be", "been": "be", "is": "be", "are": "be", "am": "be",
    "went": "go", "gone": "go", "saw": "see", "seen": "see", "had": "have", "has": "have",
    "did": "do", "done": "do", "does": "do", "made": "make", "took": "take", "taken": "take",
    "came": "come", "got": "get", "gave": "give", "given": "give", "found": "find",
    "told": "tell", "said": "say", "thought": "think", "knew": "know", "known": "know",
    "felt": "feel", "began": "begin", "begun": "begin", "became": "become", "ran": "run",
    "wrote": "write", "written": "write", "ate": "eat", "eaten": "eat", "drank": "drink",
    "bought": "buy", "brought": "bring", "taught": "teach", "left": "leave", "met": "meet",
    "sat": "sit", "stood": "stand", "kept": "keep", "slept": "sleep", "won": "win",
    "lost": "lose", "heard": "hear", "spent": "spend", "sent": "send", "built": "build",
    "flew": "fly", "grew": "grow", "grown": "grow", "drew": "draw", "threw": "throw",
    "caught": "catch", "fell": "fall", "held": "hold", "paid": "pay", "sold": "sell",
    "spoke": "speak", "spoken": "speak", "swam": "swim", "sang": "sing", "rode": "ride",
    "woke": "wake", "wore": "wear", "chose": "choose", "forgot": "forget", "understood": "understand",
    "children": "child", "men": "man", "women": "woman", "people": "person", "feet": "foot",
    "teeth": "tooth", "better": "good", "best": "good", "worse": "bad", "worst": "bad",
    "her": "she", "him": "he", "them": "they", "us": "we", "me": "i", "its": "it",
    "broke": "break", "broken": "break", "fought": "fight", "swept": "sweep", "rang": "ring", "drawn": "draw",
    "shown": "show", "meant": "mean", "dug": "dig", "shook": "shake", "hid": "hide", "hidden": "hide", "led": "lead",
    "lay": "lie", "laid": "lay", "fed": "feed", "bit": "bite", "stole": "steal", "stolen": "steal",
    "mice": "mouse", "lives": "life", "leaves": "leaf", "wives": "wife",
}

# 缩写：can't → can、won't → will、we've → we……
NEG = {"ca": "can", "wo": "will", "sha": "shall"}

def lemmas(w):
    w = w.lower().replace("’", "'")
    if w.endswith("n't"):
        w = NEG.get(w[:-3], w[:-3])
    w = re.sub(r"'(s|ve|ll|re|d|m)$", "", w)
    out = {w}
    if w in IRREG:
        out.add(IRREG[w])
    for suf, rep in (("ies", "y"), ("ied", "y"), ("ier", "y"), ("iest", "y"), ("ily", "y"),
                     ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"), ("d", ""), ("ing", ""), ("ing", "e"),
                     ("er", ""), ("er", "e"), ("est", ""), ("est", "e"), ("ly", ""), ("ful", ""), ("ness", "")):
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            b = w[: -len(suf)] + rep
            out.add(b)
            if len(b) > 2 and b[-1] == b[-2]:  # stopped → stopp → stop
                out.add(b[:-1])
    return out

def is_known(w, kn):
    return any(x in kn for x in lemmas(w))

def analyse(body, kn):
    text = " ".join(body)
    glossed = {w.lower() for w in re.findall(r"([A-Za-z]+)\s*[（(][^)）]*[一-鿿][^)）]*[)）]", text)}
    toks = tokens(text)
    lower_seen = {t.lower() for t in toks if t[0].islower()}
    unknown, total = {}, 0
    sent_start = True
    for m in re.finditer(r"[A-Za-z]+(?:['’][a-z]+)?|[.!?]", text):
        t = m.group(0)
        if t in ".!?":
            sent_start = True
            continue
        total += 1
        w = t.replace("’", "'")
        cap = w[0].isupper()
        if w.lower() in glossed or is_known(w, kn):
            pass
        elif cap and (not sent_start or w.lower() not in lower_seen) and len(w) > 1:
            pass  # 人名地名
        else:
            unknown[w.lower()] = unknown.get(w.lower(), 0) + 1
        sent_start = False
    n_unk = sum(unknown.values())
    return total, n_unk, sorted(unknown, key=lambda k: -unknown[k])

def level(rate):
    return "能读" if rate <= 0.05 else ("跳一跳" if rate <= 0.10 else "太难")

