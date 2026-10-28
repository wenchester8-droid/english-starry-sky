"""统计一册书的单词和考点在真题里出现的情况，生成 <册号>-exams.json（七上 7a、八上 8a……）。

试卷文字放在 scripts/build/exam_txt/（扫描件用 ocr.swift 识别，Word 直接取文字）。
每份卷子只统计试题部分，答案部分会被截掉。
河南中考按题号判断题型：1–20 听力、21–40 阅读、41–55 完形、56–70 语篇填空、71–75 补全对话，之后是书面表达。

用法: python build_exams.py public/data/7a.json public/data/7a-points.json scripts/build/exam_txt ../web/public/data/7a-exams.json
      python build_exams.py public/data/8a.json public/data/8a-points.json scripts/build/exam_txt ../web/public/data/8a-exams.json
"""
import json, os, re, sys

book_path, points_path, txt_dir, out = sys.argv[1:5]

# 卷子：文件名 → 显示标题、地区、年份、是否河南中考题号结构
PAPERS = [
    ("2026年河南省中考英语试题", "【试卷】2026年河南省中考英语试题.txt", "河南", 2026, True),
    ("2025年河南省中考英语试题", "2025河南中考英语真题及答案_学科网.txt", "河南", 2025, True),
    ("2024年河南省中考英语试题", "2024河南中考.txt", "河南", 2024, True),
    ("2023年河南省中考英语试题", "2023河南中考.txt", "河南", 2023, True),
    ("2022年河南省中考英语试题", "2022河南中考.txt", "河南", 2022, True),
    ("黄冈市2025-2026学年七上10月月考", "黄冈市部分学校2025-2026学年七上10月(PDF版含答案）_七年级英语.txt", "湖北", 2025, False),
    ("武汉市2024-2025学年七上12月检测", "武汉市2024-2025学年上学期七年级12月检测_七年级英语第三次月考卷.txt", "湖北", 2024, False),
    ("2024-2025学年七上12月月考", "2024-2025学年上学期七年级12月_七年级英语.txt", "", 2024, False),
    ("宜昌市夷陵区2024-2025学年七上期末", "宜昌市夷陵区2024-2025学年上学期期末七年级数学英语试题(PDF版含答案）_七年级英语试卷.txt", "湖北", 2025, False),
    ("宜昌市夷陵区2024-2025学年七下期末", "宜昌市夷陵区2024-2025学年七年级下学期期末_七年级英语.txt", "湖北", 2025, False),
]

HENAN_SECTIONS = [(20, "听力"), (40, "阅读理解"), (55, "完形填空"), (70, "语篇填空"), (75, "补全对话")]
NUM = re.compile(r"(?:^|\s|_)(\d{1,2})\s*[.．、)]|_{2,}\s*(\d{1,2})\s*_{2,}")
HEAD = re.compile(r"^\s*[一二三四五六七八九十]+\s*[、.．]\s*([一-鿿]{2,8})")


def question_text(raw: str) -> str:
    lines = [l for l in raw.splitlines() if not l.startswith("=====")]
    # 扫描件的答案页是表格：一连串只有题号的行（21、22、23……），从这里截断
    bare = [int(m.group(1)) if (m := re.fullmatch(r"\W*(\d{1,2})\s*", l)) else None for l in lines]
    for i in range(len(lines) - 6):
        run = bare[i:i + 6]
        if all(x is not None for x in run) and all(run[k + 1] == run[k] + 1 for k in range(5)):
            lines = lines[:i]
            break
    out, seen_heads, max_no = [], set(), 0
    for l in lines:
        h = HEAD.match(l)
        if h:
            if h.group(1) in seen_heads:  # 题型标题第二次出现 = 进入答案部分
                break
            seen_heads.add(h.group(1))
        if "参考答案" in l or re.match(r"^\s*【?答案】?\s*$", l):
            break
        m = re.match(r"^\s*(\d{1,2})\s*[.．]", l)
        if m:
            n = int(m.group(1))
            if max_no >= 60 and n <= 5:  # 题号从头再来 = 答案页
                break
            max_no = max(max_no, n)
        out.append(l)
    return "\n".join(out)


def sections(text: str, henan: bool):
    """给每一行标上题型。河南卷按后面最近的题号，其他卷按中文大题标题。"""
    lines = text.splitlines()
    labels = [""] * len(lines)
    if henan:
        nxt = None
        for i in range(len(lines) - 1, -1, -1):
            for m in NUM.finditer(lines[i]):
                n = int(m.group(1) or m.group(2))
                if 1 <= n <= 75:
                    nxt = n
                    break
            labels[i] = next((s for top, s in HENAN_SECTIONS if nxt and nxt <= top), "书面表达")
    else:
        cur = ""
        for i, l in enumerate(lines):
            h = HEAD.match(l)
            if h:
                cur = h.group(1)
            labels[i] = cur
    return lines, labels


def forms(word: str):
    """单词的常见变形：复数、三单、过去式、-ing。"""
    w = word.lower()
    f = {w, w + "s", w + "es", w + "ed", w + "ing", w + "d"}
    if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
        f |= {w[:-1] + "ies", w[:-1] + "ied"}
    if w.endswith("e"):
        f |= {w[:-1] + "ing"}
    if re.fullmatch(r"[^aeiou]*[aeiou][bdgmnprt]", w):
        f |= {w + w[-1] + "ing", w + w[-1] + "ed"}
    f |= IRREGULAR.get(w, set())
    return f


IRREGULAR = {
    "goose": {"geese"}, "tooth": {"teeth"}, "grandchild": {"grandchildren"}, "choose": {"chose", "chosen"},
    "fall": {"fell", "fallen"}, "grow": {"grew", "grown"}, "rise": {"rose", "risen"}, "blow": {"blew", "blown"},
    "spend": {"spent"}, "mean": {"meant"}, "send": {"sent"}, "break": {"broke", "broken"}, "get": {"got"},
    "make": {"made"}, "take": {"took", "taken"}, "go": {"went", "goes", "gone"}, "have": {"had", "has"},
    "put": {"put"}, "do": {"did", "does", "done"}, "would": set(), "stay": {"stayed", "stays"},
}
# 拼写和别的常见词撞车，统计会失真，不统计
SKIP = {"us", "found", "saying", "re", "as", "more", "most", "only", "even", "while", "other", "each", "past", "part", "mean"}


def word_pattern(entry: str):
    w = re.sub(r"\(.*?\)", "", entry).replace("’", "'").replace("...", "").replace("?", "").strip()
    alts = [a.strip() for a in w.split("/")] if "/" in w else [w]
    pats = []
    for a in alts:
        toks = a.split()
        if not toks:
            continue
        parts = []
        for i, t in enumerate(toks):
            if t in ("sb", "sth"):
                parts.append(r"\w+(?:\s\w+)?")
            elif i == 0:
                parts.append("(?:" + "|".join(sorted(map(re.escape, forms(t)), key=len, reverse=True)) + ")")
            else:
                parts.append(re.escape(t.lower()))
        pats.append(r"\s+".join(parts))
    return re.compile(r"(?<![A-Za-z'])(?:" + "|".join(pats) + r")(?![A-Za-z])", re.I)


def snippet(lines, i, m_start, m_end):
    """取匹配所在的句子，最长 140 字，命中的词用【】标出。"""
    line = lines[i]
    s = max(line.rfind(".", 0, m_start), line.rfind("?", 0, m_start), line.rfind("!", 0, m_start)) + 1
    e = min([x for x in (line.find(".", m_end), line.find("?", m_end), line.find("!", m_end)) if x != -1] or [len(line) - 1]) + 1
    text = line[s:m_start] + "【" + line[m_start:m_end] + "】" + line[m_end:e]
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= 140:
        return text
    # 句子太长（没有句号的长段落）：以命中的词为中心截一段
    k = text.find("【")
    start = max(0, k - 60)
    return ("…" if start else "") + text[start:start + 130].strip() + "…"


book = json.load(open(book_path))
points = json.load(open(points_path))
papers_meta, texts = [], []
for title, fname, region, year, henan in PAPERS:
    path = os.path.join(txt_dir, fname)
    if not os.path.exists(path):
        print("缺少", fname)
        continue
    kind = "zk" if "中考英语试题" in title else "school"
    papers_meta.append({"title": title, "region": region, "year": year, "kind": kind})
    texts.append(sections(question_text(open(path).read()), henan))
# 河南各地一模、二模、三模（去重后的清单见 scripts/build/mock_papers.json），题号结构和中考一样
for m in json.load(open(os.path.join(os.path.dirname(txt_dir), "mock_papers.json"))):
    papers_meta.append({"title": m["title"], "region": "河南", "year": m["year"], "kind": "mock"})
    # 模拟卷题号写法五花八门，题型按卷子里的中文大题标题（「三、完形填空」）来认
    texts.append(sections(question_text(open(os.path.join(txt_dir, m["file"])).read()), False))

words_out = {}
for u in book["units"]:
    for w in u["words"]:
        if w["proper"] or w["id"] in SKIP:
            continue
        pat = word_pattern(w["w"])
        hits = []
        for pi, (lines, labels) in enumerate(texts):
            best = None
            for i, l in enumerate(lines):
                # 卷首说明、题目要求这类以中文为主的行不算
                if len(re.findall(r"[\u4e00-\u9fff]", l)) * 3 > len(re.findall(r"[A-Za-z]", l)):
                    continue
                m = pat.search(l)
                # 全大写缩写（UK、US、AM、IT）要求大小写一致，避免把 us、it 算进去
                if m and w["w"].isupper() and len(w["w"]) <= 3 and m.group(0) != w["w"]:
                    m = None
                if m:
                    is_option = bool(re.search(r"(?:^|\s|[a-z])[A-D][.．]\s*\S", l))
                    if is_option:  # 选项行：整行显示，选项之间留空
                        opt = re.sub(r"(?<=\S)\s*([B-D])[.．]\s*", r"   \1. ", l.strip())
                        mm = pat.search(opt)
                        t = opt[: mm.start()] + "【" + mm.group(0) + "】" + opt[mm.end():] if mm else opt
                        cand = {"p": pi, "sec": labels[i], "t": t}
                    else:
                        cand = {"p": pi, "sec": labels[i], "t": snippet(lines, i, m.start(), m.end())}
                    # 优先选题型明确、上下文较长的那一处
                    cand["_score"] = (cand["sec"] != "听力") * 2 + (not is_option) * 3 + min(len(cand["t"]), 120) / 120
                    if best is None or cand["_score"] > best["_score"]:
                        best = cand
            if best:
                best["_q"] = best.pop("_score")
                hits.append(best)
        if hits:
            # 每种卷子各数一下；原句只留几条：中考真题全留，再加最新的模拟卷和学校考卷
            n = {k: sum(1 for h in hits if papers_meta[h["p"]]["kind"] == k) for k in ("zk", "mock", "school")}
            order = {"zk": 0, "mock": 1, "school": 2}
            # 模拟卷、学校考卷里先挑完整句子（不是选项、不是听力），再按年份从新到旧
            hits.sort(key=lambda h: (order[papers_meta[h["p"]]["kind"]], -h["_q"], -papers_meta[h["p"]]["year"]))
            for h in hits:
                h.pop("_q")
            shown = [h for h in hits if papers_meta[h["p"]]["kind"] == "zk"]
            shown += [h for h in hits if papers_meta[h["p"]]["kind"] != "zk"][: max(3, 6 - len(shown))]
            words_out[w["id"]] = {"n": n, "h": shown}

# 考点：河南中考语篇填空（56–70）和补全对话（71–75），按标准答案人工判断考的是哪个考点。
# 只收本册考点能对上的题；还没学的语法不收。
ZK_KEYS_7A = {
    2022: {58: ("their", "u1-possessive"), 56: ("ways", "su2-plural"), 66: ("are", "u1-be"), 67: ("a", "su2-article"),
           62: ("if", None), 72: ("What's it about", "u7-wh-review"), 73: ("Can you give me some advice", "u5-can"),
           75: ("Would you like to go with me", "u1-wh")},
    2023: {57: ("my", "u1-possessive"), 62: ("years", "su2-plural"), 70: ("There", "u3-there-be"),
           72: ("Do you want to go with me", "u5-club"), 74: ("What did you do", "u7-wh-review")},
    2024: {59: ("his", "u1-possessive"), 63: ("and", "u4-conj"), 64: ("movies", "su2-plural"), 66: ("is", "u1-be"),
           67: ("the", None), 71: ("Can you give me some advice", "u5-can"), 73: ("Where is it", "u3-where"),
           75: ("You're welcome", "su1-greet")},
    2025: {56: ("his", "u1-possessive"), 61: ("years", "su2-plural"), 63: ("and", "u4-conj"), 70: ("is", "u1-be"),
           72: ("What is it about", "u7-wh-review"), 73: ("What do you usually do in the club", "u6-wh"),
           74: ("Yes, it is", "u1-be")},
    2026: {56: ("them", "u1-object-pronoun"), 62: ("rushes", "u2-third-person"), 63: ("years", "su2-plural"),
           65: ("because", "u4-conj"), 66: ("are", "u1-be"), 67: ("and", "u4-conj"), 69: ("an", "su2-article"),
           71: ("What's it about", "u7-wh-review"), 73: ("Do you know any other famous people from Henan", "u2-do-does"),
           74: ("Can you tell me more about him", "u5-can")},
}


ZK_KEYS_8A = {
    2022: {65: ("longer", "8a-u3-comparative"), 73: ("Can you give me some advice", "8a-u2-requests")},
    2023: {61: ("harder", "8a-u3-comparative"), 65: ("decided", "8a-u1-past"), 74: ("What did you do", "8a-u1-past"),
           75: ("We watched a robot show", "8a-u1-past")},
    2024: {60: ("needed", "8a-u1-past"), 62: ("caught", "8a-u1-past"), 65: ("greatest", "8a-u4-superlative"),
           71: ("Can you give me some advice", "8a-u2-requests"), 72: ("What about going to my hometown", "8a-u7-shall")},
    2025: {60: ("traveled", "8a-u1-past"), 65: ("considered", "8a-u1-past")},
    2026: {58: ("cleanest", "8a-u4-superlative")},
}
ZK_KEYS_9 = {
    2022: {57: ("developed", "9-u1-present-perfect"), 61: ("which", "9-u7-relative")},
    2023: {69: ("who", "9-u7-relative")},
    2024: {69: ("that", "9-u7-relative")},
    2025: {65: ("considered", "9-u5-passive")},
    2026: {61: ("built", "9-u1-present-perfect")},
}
ZK_KEYS = {"7a": ZK_KEYS_7A, "8a": ZK_KEYS_8A, "9": ZK_KEYS_9}.get(book.get("id"), {})


def find_blanks(lines):
    """按题号顺序找出 56–75 题的空在哪一行：从完形第 55 题之后开始，一题一题往下找。"""
    starts = [i for i, l in enumerate(lines) if re.match(r"^\s*55\s*[.．]", l)]
    pos, found = (starts[-1] + 1 if starts else 0), {}
    for n in range(56, 76):
        blank = re.compile(r"(?<![0-9A-Za-z£$:/.])" + str(n) + r"(?![0-9A-Za-z:/%])")
        for i in range(pos, len(lines)):
            m = blank.search(lines[i])
            if m:
                found[n] = (i, m)
                pos = i
                break
    return found


def blank_snippet(lines, found, n, answer):
    """把第 n 题的空换成【答案】，取所在的句子。"""
    if n not in found:
        return "【" + answer + "】"
    i, m = found[n]
    l = lines[i]
    start, end = m.start(), m.end()
    while start > 0 and l[start - 1] in "_ ":
        start -= 1
    while end < len(l) and l[end] in "_ .":
        end += 1
    text = l[:start] + " 【" + answer + "】 " + l[end:]
    if len(re.sub(r"[_\s\d.]", "", l)) < 6 and i > 0:  # 这一行只有空，带上上一句
        text = lines[i - 1] + " " + text
    text = re.sub(r"\s+", " ", text).strip()
    k = text.find("【")
    s0 = max(text.rfind(". ", 0, max(0, k - 1)), text.rfind("? ", 0, max(0, k - 1)), text.rfind("! ", 0, max(0, k - 1)))
    text = text[s0 + 2:] if s0 > 0 and k - s0 < 120 else text
    return text if len(text) <= 160 else text[:157] + "…"


points_out = {}
for pi, meta in enumerate(papers_meta):
    # 答案只对中考真题本身有效；模拟卷题号相同但内容不同，不能套用
    keys = ZK_KEYS.get(meta["year"]) if meta["kind"] == "zk" else None
    if not keys:
        continue
    lines, _ = texts[pi]
    found = find_blanks(lines)
    for n, (answer, pid) in sorted(keys.items()):
        if not pid:
            continue
        sec = "语篇填空" if n <= 70 else "补全对话"
        points_out.setdefault(pid, []).append({"p": pi, "sec": f"{sec}第{n}题", "t": blank_snippet(lines, found, n, answer)})

json.dump({"papers": papers_meta, "words": words_out, "points": points_out}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
total = sum(1 for u in book["units"] for w in u["words"] if not w["proper"])
kinds = {k: sum(1 for p in papers_meta if p["kind"] == k) for k in ("zk", "mock", "school")}
print(f"{len(papers_meta)} 份卷子（中考真题 {kinds['zk']}、模拟卷 {kinds['mock']}、学校考卷 {kinds['school']}）；"
      f"{len(words_out)}/{total} 个单词出现过；{len(points_out)} 个考点找到了中考真题用例")
