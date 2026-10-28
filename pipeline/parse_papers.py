"""拆卷：把 真题/ 里的卷子拆成「阅读理解」一篇篇文章 + 题目 + 答案（有的话）。

- Word：按文档顺序读段落和表格；文本框里的段落、图片（选项是图的题）都保留，
  图片存到 build/reading_img/<卷号>/，正文里写成 [图:<卷号>/<文件名>]。
- 河南中考 2022–2024 是扫描件，用 build/exam_txt 里识别好的文字；七年级 PDF 卷同样用识别好的文字。
- 同一篇文章在不同卷子里出现（转载、改名）只留一份。

用法: python parse_papers.py   → build/papers_reading.json
"""
import glob, hashlib, json, os, re, shutil, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
ZT = os.path.join(ROOT, "真题")
EXAM_TXT = os.path.join(HERE, "build", "exam_txt")
IMG_OUT = os.path.join(HERE, "build", "reading_img")
OUT = os.path.join(HERE, "build", "papers_reading.json")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
V = "{urn:schemas-microsoft-com:vml}"
MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"


# ---------- Word → 文字行 ----------
def docx_lines(path, pid):
    z = zipfile.ZipFile(path)
    rels = {}
    try:
        for r in ET.fromstring(z.read("word/_rels/document.xml.rels")):
            rels[r.get("Id")] = r.get("Target")
    except KeyError:
        pass
    root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    lines, saved = [], set()

    def image(rid):
        tgt = rels.get(rid, "")
        if not tgt or tgt.startswith("http"):
            return ""
        name = os.path.basename(tgt)
        if name.lower().endswith((".wmf", ".emf")):  # 公式图之类，浏览器显示不了
            return ""
        if name not in saved:
            os.makedirs(os.path.join(IMG_OUT, pid), exist_ok=True)
            try:
                with z.open("word/" + tgt.lstrip("/").replace("word/", "")) as f, \
                        open(os.path.join(IMG_OUT, pid, name), "wb") as g:
                    shutil.copyfileobj(f, g)
                saved.add(name)
            except KeyError:
                return ""
        return f"[图:{pid}/{name}]"

    def para(p, extra):
        """一个段落的文字；文本框里的段落放进 extra，排在本段之后。"""
        buf = []

        def walk(el):
            tag = el.tag
            if tag == MC + "Fallback":  # 和 Choice 内容重复
                return
            if tag == W + "txbxContent":
                for sub in el:
                    if sub.tag == W + "p":
                        extra.extend(para(sub, extra))
                    elif sub.tag == W + "tbl":
                        extra.extend(table(sub))
                return
            if tag == W + "t":
                buf.append(el.text or "")
            elif tag in (W + "tab",):
                buf.append(" ")
            elif tag in (W + "br", W + "cr"):
                buf.append("\n")
            elif tag == A + "blip":
                buf.append(image(el.get(R + "embed")))
            elif tag == V + "imagedata":
                buf.append(image(el.get(R + "id")))
            for c in el:
                walk(c)

        walk(p)
        return "".join(buf).split("\n")

    def table(t):
        out = []
        for tr in t.iter(W + "tr"):
            cells = []
            for tc in tr.findall(W + "tc"):
                ex = []
                txt = " ".join(" ".join(para(p, ex)) for p in tc.findall(W + "p"))
                cells.append((txt + " " + " ".join(ex)).strip())
            out.append("   ".join(c for c in cells if c))
        return out

    for el in body:
        if el.tag == W + "p":
            ex = []
            lines.extend(para(el, ex))
            lines.extend(ex)
        elif el.tag == W + "tbl":
            lines.extend(table(el))
    return lines


# ---------- 文字行整理 ----------
QNUM = r"(\d{1,2})\s*[.．、]?\s*"
def normalize(lines):
    out = []
    for l in lines:
        l = l.replace("　", " ").replace("\xa0", " ").rstrip()
        # 「……根据材料内容选择最佳答案。11. Why」这类粘连：在说明语和题号前断行
        l = re.sub(r"(根据(?:材料|短文|以上)[^。]*。|阅读下[面列][^。]*。)", r"\n\1\n", l)
        l = re.sub(r"(?<=[.!?\"”’)）a-z])\s*(?=\d{1,2}\s*[.．]\s*(?:What|Which|Why|How|Who|Where|When|Whose|The|According|In|From|It|This|We|A|Paragraph)\b)", "\n", l)
        for x in l.split("\n"):
            # 六选五的空格编号「    19     You can't……」行首留着 BLANK 标记，别当成题号
            if re.match(r"^\s{2,}\d{1,2}\s{2,}\S|^\d{1,2}\s{3,}\S", x):
                x = "【空】" + x.strip()
            out.append(x.strip())
    return [l for l in out if l]


HEAD = re.compile(r"^\s*(?:第[一二三四五六七八九十]+部分\s*)?[一二三四五六七八九十]+\s*[、.．]\s*([一-鿿（）()]{2,12})")
def reading_lines(lines):
    """取「阅读理解」大题的行（到下一个大题标题为止）。"""
    s = next((i for i, l in enumerate(lines) if HEAD.match(l) and "阅读理解" in l), None)
    if s is None:
        s = next((i for i, l in enumerate(lines) if "阅读理解" in l and len(l) < 40), None)
    if s is None:
        return None
    e = next((i for i in range(s + 1, len(lines)) if HEAD.match(lines[i]) and "阅读" not in lines[i]), len(lines))
    return lines[s + 1:e]


Q = re.compile(r"^\s*(\d{1,2})\s*[.．、]\s*(.*)$|^\s*(\d{1,2}) ([A-Z][^.]{3,150}[?？_])\s*$")
OPT_SPLIT = re.compile(r"(?:(?<=^)|(?<=[\s.。!?)）\]]))([A-G])\s*[.．、]\s*")
BLANK = re.compile(r"(?:_{2,}|\s{2,}|#)\s*(\d{1,2})\s*(?:_{2,}|\s{2,}|#|$)|^\s*(\d{1,2})\s{3,}")
SKIP = re.compile(r"^(根据|阅读下|请阅读|从下面|根据短文|第[一二三]节)|^\s*[A-E]\s*$|^【(?!空)")

def split_options(l):
    parts = OPT_SPLIT.split(l)
    if len(parts) < 3 or parts[0].strip():
        return None
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}

def split_passages(sec):
    """正文 → 题目 → 正文 → 题目……；单独一行的 A/B/C/D 也强制分篇。"""
    passages, cur, qs, state = [], [], [], "body"
    q = None

    def flush():
        nonlocal cur, qs, q
        if cur or qs:
            passages.append({"body": cur, "questions": qs})
        cur, qs, q = [], [], None

    for l in sec:
        t = l.strip()
        if re.fullmatch(r"[A-E]", t):
            if cur or qs:
                flush()
            state = "body"
            continue
        if SKIP.search(t) and len(t) < 60:
            continue
        m = Q.match(t)
        opts = split_options(t)
        is_q = bool(m) and not (len(t) > 160 and not t.rstrip().endswith("?"))
        if is_q:
            n = int(m.group(1) or m.group(3))
            stem = (m.group(2) if m.group(1) else m.group(4)) or ""
            so = split_options(stem)
            # 题干后面同一行跟着选项
            mm = re.search(r"(?<=[?？.])\s*(?=A\s*[.．])", stem)
            q = {"no": n, "stem": stem.strip(), "options": {}}
            if mm:
                q["stem"] = stem[:mm.start()].strip()
                q["options"] = split_options(stem[mm.start():].strip()) or {}
            elif so and not stem.strip().startswith("A"):
                pass
            qs.append(q)
            state = "q"
            continue
        if opts:
            if q is not None and state == "q":
                q["options"].update(opts)
            else:  # 六选五：选项跟在文章后面，没有题号
                q = {"no": None, "stem": "", "options": opts}
                qs.append(q)
                state = "q"
            continue
        if state == "q":
            if q is not None and not q["options"] and len(t) < 200:  # 题干续行
                q["stem"] += " " + t
                continue
            flush()
            state = "body"
        cur.append(t.replace("【空】", "    ").strip() if t.startswith("【空】") else t)
    flush()
    return passages


# ---------- 答案 ----------
def answers_from(text):
    """【答案】21. D 22. C ……  或者 答案表 21 22 23 / D C B。返回 {题号: 字母}。"""
    ans = {}
    # 表格答案：「题号 21 22 23 …」下一行「答案 C B D …」
    ls = text.splitlines()
    for a, b in zip(ls, ls[1:]):
        nums = re.findall(r"\b(\d{1,2})\b", a)
        lets = re.findall(r"(?<![A-Za-z])([A-G])(?![A-Za-z])", b)
        if len(nums) >= 3 and len(nums) == len(lets) and not re.search(r"[A-Za-z]{2,}", re.sub("题号|答案", "", a + b)):
            for n, x in zip(nums, lets):
                ans.setdefault(int(n), x)
    for m in re.finditer(r"(\d{1,2})\s*[.．、]\s*([A-G])(?![a-z])", text):
        ans.setdefault(int(m.group(1)), m.group(2))
    return ans

def inline_answers(lines):
    """学科网格式：每组题后面跟着 【答案】26. D 27. A ……"""
    text = "\n".join(l for l in lines if "答案" in l)
    return answers_from(text)


# ---------- 卷子清单 ----------
def pid_of(path):
    return hashlib.md5(path.encode()).hexdigest()[:8]

def paper_title(path):
    n = os.path.basename(path)
    n = re.sub(r"^\d+_|\.docx$|\.txt$", "", n)
    return n

def collect():
    papers = []
    # 河南中考
    zk = os.path.join(ZT, "河南中考英语真题")
    papers.append(dict(title="2026年河南中考", kind="中考真题", year=2026, path=os.path.join(zk, "2026_学科网原始文件", "【试卷】2026年河南省中考英语试题.docx"),
                       answer=os.path.join(zk, "2026_学科网原始文件", "【答案】2026年河南省中考英语试题.docx")))
    papers.append(dict(title="2025年河南中考", kind="中考真题", year=2025, path=os.path.join(zk, "2025河南中考英语真题及答案_学科网.docx")))
    for y in (2024, 2023, 2022):
        papers.append(dict(title=f"{y}年河南中考", kind="中考真题", year=y, path=os.path.join(EXAM_TXT, f"{y}河南中考.txt"), henan_txt=True))
    # 七年级卷（扫描件用识别好的文字）
    for f in ("黄冈市部分学校2025-2026学年七上10月(PDF版含答案）_七年级英语.txt",
              "武汉市2024-2025学年上学期七年级12月检测_七年级英语第三次月考卷.txt",
              "2024-2025学年上学期七年级12月_七年级英语.txt",
              "宜昌市夷陵区2024-2025学年上学期期末七年级数学英语试题(PDF版含答案）_七年级英语试卷.txt",
              "宜昌市夷陵区2024-2025学年七年级下学期期末_七年级英语.txt"):
        papers.append(dict(title=paper_title(f), kind="七年级卷", year=None, path=os.path.join(EXAM_TXT, f)))
    # 河南模拟卷（Word）
    for p in sorted(glob.glob(os.path.join(ZT, "**", "*.docx"), recursive=True)):
        rel = os.path.relpath(p, ZT)
        if rel.startswith(("河南中考英语真题", "人教版新课标")):
            continue
        t = paper_title(p)
        y = re.search(r"20(2[4-6])", t)
        kind = "模拟卷"
        papers.append(dict(title=t, kind=kind, year=int("20" + y.group(1)) if y else None, path=p))
    return papers


def henan_txt_reading(text):
    """扫描件：21–40 题之间的行，往前到 20 题为止。"""
    lines = [l for l in text.splitlines() if not l.startswith("=====")]
    first = next(i for i, l in enumerate(lines) if re.match(r"^\s*21\s*[.．]?\s", l))
    last = next(i for i, l in enumerate(lines) if re.match(r"^\s*41\s*[.．]", l))
    start = max((i for i in range(first) if re.match(r"^\s*(1[5-9]|20)\b", lines[i]) or "阅读理解" in lines[i]), default=-1)
    # 20 题的选项也在后面几行，跳过选项
    while start + 1 < first and re.match(r"^\s*[A-C]\s*[.．]", lines[start + 1]):
        start += 1
    return lines[start + 1:last], lines[last:]


def main():
    if os.path.isdir(IMG_OUT):
        shutil.rmtree(IMG_OUT)
    out, seen, stats = [], {}, {"卷子": 0, "没找到阅读": [], "重复文章": 0}
    for paper in collect():
        pid = pid_of(paper["path"])
        if paper.get("henan_txt"):
            sec, rest = henan_txt_reading(open(paper["path"]).read())
            ans = answers_from("\n".join(rest))
            sec = normalize(sec)
        elif paper["path"].endswith(".txt"):
            lines = normalize(open(paper["path"]).read().splitlines())
            sec = reading_lines(lines)
            ans = {}
        else:
            lines = normalize(docx_lines(paper["path"], pid))
            sec = reading_lines(lines)
            ans = inline_answers(lines)
            if paper.get("answer"):
                al = normalize(docx_lines(paper["answer"], pid + "a"))
                ar = reading_lines(al) or al
                ans = answers_from("\n".join(ar))
        stats["卷子"] += 1
        if not sec:
            stats["没找到阅读"].append(paper["title"])
            continue
        ps = split_passages(sec)
        kept = []
        for i, p in enumerate(ps):
            words = re.findall(r"[A-Za-z]+", " ".join(p["body"]))
            if len(words) < 40:
                continue
            # 同一篇文章被不同卷子转载时常有小改动：五连词重合过半就算重复
            grams = {" ".join(words[k:k + 5]).lower() for k in range(len(words) - 4)}
            if any(len(grams & g) > 0.5 * min(len(grams), len(g)) for g in seen):
                stats["重复文章"] += 1
                continue
            seen[frozenset(grams)] = paper["title"]
            for q in p["questions"]:
                if q["no"] and q["no"] in ans:
                    q["answer"] = ans[q["no"]]
                if q["no"] is None:  # 六选五：从正文里找空格编号
                    body = "\n".join(p["body"])
                    nums = [int(x) for x in re.findall(r"(?:^|\s{2,}|_{2,}|[(（]\s*)(\d{1,2})(?=\s{2,}|_{2,}|\s*[)）]|\s*$)", body, re.M)]
                    nums = [n for n in nums if 1 <= n <= 80]
                    q["blanks"] = sorted(set(nums))
                    if q["blanks"] and all(n in ans for n in q["blanks"]):
                        q["answers"] = {n: ans[n] for n in q["blanks"]}
                    p_ok = len(q["blanks"]) >= 4
            nq = len(p["questions"])
            p.update(id=f"{pid}-{len(kept)}", paper=paper["title"], kind=paper["kind"], year=paper["year"],
                     words=len(words), hasImage=any("[图:" in x for x in p["body"] + [str(q) for q in p["questions"]]),
                     answered=nq > 0 and all(("answer" in q) if q["no"] else ("answers" in q) for q in p["questions"]))
            kept.append(p)
        out.extend(kept)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    from collections import Counter
    print("卷子", stats["卷子"], "文章", len(out), "重复去掉", stats["重复文章"])
    print("按类型", Counter(p["kind"] for p in out))
    print("有官方答案的文章", sum(p["answered"] for p in out), "含图", sum(p["hasImage"] for p in out))
    print("没有题目的文章", sum(not p["questions"] for p in out))
    print("没找到阅读理解：", stats["没找到阅读"])


if __name__ == "__main__":
    main()
