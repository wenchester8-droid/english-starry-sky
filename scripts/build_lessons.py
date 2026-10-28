"""课文点读数据：录音逐词识别结果 → 逐词对齐课本原文 → 生成 public/data/7a-lessons.json。

用法: python3 scripts/build_lessons.py 逐词识别.json 课本全文.txt [册号，默认 7a]
  逐词识别.json  由 app/scripts/transcribe_book_audio.py 生成（{文件名: [[词, 开始, 结束], ...]}）
  课本全文.txt   课本 PDF 抽出的文字（第 90–99 页是听力原文）

做法：按停顿和句号把识别结果切成句子（时间来自识别），再把整段识别的词和课本里最吻合的那一段逐词对齐，
每句显示课本里对应的那段原文（拼写、标点、大小写都以课本为准）。对不上课本的句子保留识别文字，并在终端列出来核对。
语音板块（Pronunciation）和字母、数字跟读那类录音，课本里没有成句的原文，不放进点读。
"""
import difflib, json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from lesson_files import parse

ROOT = os.path.join(os.path.dirname(__file__), "..")
words_json, book_txt = sys.argv[1:3]
BOOK = sys.argv[3] if len(sys.argv) > 3 else "7a"
GAP = 0.9  # 两个词之间停顿超过这么多秒，也算一句结束
OK = 0.75  # 一句里至少这么多词和课本对上，才用课本原文

HEADER = re.compile(r"^(Starter Unit|Start a unit|Unit \d|UNIT|Section [AB]|Activity|Big question|Pronunciation)\b", re.I)
INSTR = re.compile(r"^(Listen|Read|Look|Watch|Sing|Say|Repeat|Number|Match|Circle|Tick|Talk)\b")
# 录音里读的题目要求（「Fill in the blanks …」「Then role-play …」），不放进点读
DROP = re.compile(r"^(Fill in|Number the|Underline|Then role|Find out|Circle the|Tick the|Complete the|Answer the|Role.play|Listen (and|to|again)|Read (and|the)|Skim|Scan|Choose (the|a)|Find the|Discuss|Circle in|The three jobs you hear|Then answer the questions|Put the sentences in|Who did the author write|What are Matt's and Diana's opinions|Some have two answers|.*Big question|What problems in 2A|How has the environment affected|Who does each family member admire|Match each paragraph|Take the topics|Then listen again|What are the students talking about|Write short answers|What brings about changes|What changes have taken place around you|What makes a good learner|How do we learn\?|What do creative ideas bring about|What changes can inventions bring|What does it take to explore space|Why do we explore space|Circle T for true|Or F for false|Who is the speaker|What rules does she talk about|Tick (them|what)|What does Jane have for|B, lunch|Then,? (role-?play|retell)|Conversation (one|two|three|four)|Why are free.?time activities|How do you spend your free time|Take the things they|Write the (health problems|letter for each)|Who got some medicine|Circle (Peter|what each)|Why do we explore|How do natural disasters|What happens during a natural|What natural disasters did|Share your ideas on why|Match each student)\b|^\d+\.?$", re.I)
# 识别时听错的人名、数字（对不上课本、保留识别文字的句子才用到），按课本写法改
FIX = [
    (r"\bTung[ -]?Fae\b|\btongue -fay\b", "Teng Fei"), (r"\bWong Yarming\b", "Wang Yaming"),
    (r"\bSong (Mei Mei|May May)\b", "Song Meimei"), (r"\b(fushing|Fooshing|Fushing)\b", "Fu Xing"),
    (r"\bMiss Gao\b", "Ms Gao"), (r"\bMiss Hui\b", "Ms Hui"), (r"\bMiss Lee\b", "Ms Li"), (r"\bHanlene\b", "Han Lin"),
    (r"\bLuja Chi\b", "Lu Jiaqi"), (r"\bU -Shauming\b", "Yu Xiaoming"), (r"\bOobene Bean\b", "Wu Binbin"),
    (r"\bMa Zhahui\b", "Ma Xiaohui"), (r"\bCiao Tzu\b", "Jiaozi"), (r"\bBao Tzu\b", "Baozi"), (r"\bMom\b", "Mum"),
    (r"\bokay\b", "OK"), (r"\bOkay\b", "OK"), (r"\bcolor\b", "colour"), (r"\broom 303 at 4 \.30pm\b", "Room 303 at 4:30 p.m."),
    (r"\bmarxh \.food at happymail \.com\b", "maxh.food@happymail.com"), (r"\bJenny66 at Happymail \.com\b", "jenny66@happymail.com"),
    (r"\b(\d{1,2})(\d\d) ?PM\b", r"\1:\2 PM"),
    # 八上
    (r"\bYamming\b", "Yaming"), (r"\bset many goals\b", "set mini-goals"), (r"\b7pm\b", "7 p.m."),
    # 九年级
    (r"\bFushin\b", "Fu Xing"), (r"\bChenzia\b", "Chen Jie"), (r"\bHanline\b", "Han Lin"), (r"\bTongfei\b", "Teng Fei"),
    (r"\bSupersea\b", "Super See"), (r"\bon Bass and Nairobi\b", "Mombasa-Nairobi"), (r"\bRhoo, peeper\b", "erhu, pipa"),
    (r"\b4x100 metre\b", "4 × 100 m"), (r"\bpull -up\b", "pull-up"), (r"\bpaper -making\b", "papermaking"),
    (r"but type of a music that touches me", "but I prefer music that touches me"),
    (r"\bLile\b", "Li Lei"), (r"\bShi Tao\b", "Xie Tao"), (r"\bSong Meme\b", "Song Meimei"), (r"\bHanlin\b", "Han Lin"),
    (r"\b4x100 meter\b", "4 × 100 m"),
    # 七下
    (r"\bo 'clock\b", "o'clock"), (r"\bpink pung bat\b", "pink ping-pong bat"), (r"\bplay double sometime\b", "play doubles sometime"),
    (r"\bLee -?Meng\b", "Li Meng"), (r"\bHow E and I are making zongs up\b", "Hao Yi and I are making zongzi"),
    (r"\bDragon Boat Races\b", "dragon boat races"), (r"^Gears,? the Emperors' new clothes by Hans Christian Anderson\.", "Here's The Emperor's New Clothes by Hans Christian Andersen."),
    (r"\bBest doctor know\b", "Dear Dr Know"),
    # 八下
    (r"\bLiolien Man\b", "Liu Lianman"), (r"\bWang Fujo\b", "Wang Fuzhou"), (r"\bChu Ying Hua\b", "Qu Yinhua"),
    (r"\bAt 4 \.20am, on the 25th of May\b", "At 4:20 a.m. on 25 May"), (r"\bShin ?-?[Yy]i\b", "Xinyi"),
    (r"\bsnow storm last weekend terrible you, Yun\b", "snowstorm last weekend terrible, Liu Yun"),
    (r"\baround the worlds in 80 days\b", "Around the World in Eighty Days"), (r"\bTung Tha\b", "Teng Fei"),
    (r"\bfree -time\b", "free-time"),
]
# 网页截图里的按钮字（「Posts」「Contact」）、邮件抬头这类，不放进点读
JUNK = re.compile(r"^(Day|Posts?|Contact|By|Celebrations|About us|People|What new|[A-Z]{3,})\.?$|\.com\b.*\.com\b|^(Match the|Then ro(le|ll)|Which club does|Why are .* early\?)")
TITLE = re.compile(r"^(Mr|Mrs|Ms|Dr)\.$")


def words_of(tok: str):
    return re.sub(r"[^a-z0-9']+", " ", tok.replace("’", "'").lower()).split()


# ---------- 课本：一长串词，每个词记着它属于哪个原文片段 ----------
text = open(book_txt, encoding="utf-8").read()
text = re.sub(r"=====PAGE \d+|仅供个人学习使用，未经授权不得另做他用", " ", text)
text = re.sub(r"[\u200b\u00a0\ufeff]", " ", text)
text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
text = re.sub(r"[一-鿿＀-￯。]+", " | ", text)  # 中文当分隔
text = re.sub(r"(^|\n)\s*[A-Z][A-Za-z]*( [A-Z0-9][a-z0-9]*)?:\s+", r"\1", text)  # 去掉「Teng Fei:」「A:」这类说话人
text = re.sub(r"(^|\n)\s*Conversation \d+\.?", r"\1", text)
cut = text.find("Listening Scripts", text.find("Listening Scripts") + 1)  # 第一次是目录，第二次起是听力原文
toks = text[:cut].split()
SCRIPT_TOK = len(toks)
toks += text[cut:].split()
B, owner = [], []  # B: 课本的词（小写），owner: 这个词来自 toks 里第几个
for i, t in enumerate(toks):
    for w in words_of(t):
        B.append(w)
        owner.append(i)
SCRIPT = owner.index(next(i for i in owner if i >= SCRIPT_TOK))  # 听力原文从课本第几个词开始


def book_text(a: int, b: int) -> str:
    """课本第 a..b 个词所在的原文片段。"""
    s = " ".join(toks[owner[a] : owner[b] + 1]).replace(" | ", " ").strip(" |")
    s = re.sub(r"\s+(UNIT|Unit) \d+\b.*$", "", s)  # 跨到页脚「UNIT 3 40」的截掉
    return re.sub(r"^[^A-Za-z0-9\"']+", "", s)


def region(W, lo=0, hi=None):
    """课本里和这段录音最吻合的一段：三连词命中最密的窗口。
    课文页上的对话常挖了空（「old / new」），听力原文是完整的，差不多吻合时优先用听力原文。"""
    grams = {tuple(W[i : i + 3]) for i in range(len(W) - 2)}
    hit = [1 if tuple(B[i : i + 3]) in grams else 0 for i in range(len(B))]
    span = int(len(W) * 1.4) + 10

    def densest(lo, hi):
        acc = sum(hit[lo : lo + span])
        top, at = acc, lo
        for i in range(lo + 1, hi - span):
            acc += hit[i + span - 1] - hit[i - 1]
            if acc > top:
                top, at = acc, i
        return top, at

    hi = len(B) if hi is None else min(hi, len(B))
    top, at = densest(lo, hi)
    if lo < SCRIPT < hi:
        top2, at2 = densest(SCRIPT, hi)
        if top2 >= top * 0.8:
            at = at2
    return at, at + span


# ---------- 识别结果切句 ----------
def sentences(words):
    cur = []
    for i, (w, s, e) in enumerate(words):
        cur.append(i)
        nxt = words[i + 1][1] if i + 1 < len(words) else None
        end = (re.search(r"[.?!]$", w) and not TITLE.match(w)) or nxt is None or nxt - e > GAP
        if end and w.endswith(",") and nxt is not None and nxt - e < 2.5:
            end = False  # 「Hi,」后面停顿了一下，还是同一句
        if end:
            yield cur
            cur = []


def cluster(hits):
    """一句里对上的课本位置，只取挨得最紧的那一串（分栏文章偶尔会对到别的栏去）。"""
    best, cur = [], []
    for h in hits:
        cur = cur + [h] if cur and h - cur[-1] <= 3 else [h]
        if len(cur) > len(best):
            best = cur
    return best


def build(words, gated: bool):
    # 识别结果的每个词展开成小写词，记住来自第几个识别词
    W, src = [], []
    for i, (w, _, _) in enumerate(words):
        for x in words_of(w):
            W.append(x)
            src.append(i)
    to_book = {}  # 识别词序号 → 课本词序号

    def align(lo_w, hi_w, a0, a1):
        sm = difflib.SequenceMatcher(None, W[lo_w:hi_w], B[a0:a1], autojunk=False)
        for blk in sm.get_matching_blocks():
            for k in range(blk.size):
                to_book.setdefault(lo_w + blk.a + k, a0 + blk.b + k)

    a0, a1 = region(W)
    align(0, len(W), a0, a1)
    # 课本 PDF 里分栏的文章（广告、海报）顺序和录音不一样：连着一长串没对上的，在附近几页再单独找一次
    i = 0
    while i < len(W):
        if i in to_book:
            i += 1
            continue
        j = i
        while j < len(W) and j not in to_book:
            j += 1
        if j - i >= 6:
            b0, b1 = region(W[i:j], max(0, a0 - 800), a1 + 800)
            align(i, j, b0, b1)
        i = j
    first = {}
    for j, i in enumerate(src):
        first.setdefault(i, []).append(j)

    lines, miss, started = [], [], not gated
    for idx in sentences(words):
        raw = " ".join(words[i][0] for i in idx)
        raw = re.sub(r"^Conversation \d+\.?\s*", "", raw).strip()
        if not raw or HEADER.match(raw) or (started and (DROP.match(raw) or JUNK.search(raw))):
            continue  # 报单元、报题号、「Conversation 1」这些不放进点读
        if not started:
            started = bool(INSTR.match(raw))  # 题目要求读完，正文才开始
            continue
        js = [j for i in idx for j in first.get(i, [])]
        hits = cluster(sorted(to_book[j] for j in js if j in to_book))
        ok = bool(js) and len(hits) >= OK * len(js)
        span = (min(hits), max(hits)) if ok else None
        for pat, rep in FIX:
            raw = re.sub(pat, rep, raw)
        lines.append({"t": raw[0].upper() + raw[1:], "s": round(words[idx[0]][1], 2), "e": round(words[idx[-1]][2], 2), "span": span})
    # 整句没对上（多是人名识别错：「Chancia」），前后两句都对上了、中间课本只隔几个词，就用课本这几个词
    for k in range(1, len(lines) - 1):
        p, l, n = lines[k - 1]["span"], lines[k], lines[k + 1]["span"]
        if not l["span"] and p and n and 0 < n[0] - p[1] - 1 <= 10:
            l["span"] = (p[1] + 1, n[0] - 1)
    # 句尾几个词没识别对（「Song May May」），课本原文补到下一句开始之前，最多补到句号
    for k, l in enumerate(lines):
        if not l["span"]:
            continue
        a, b = l["span"]
        nxt = next((x["span"][0] for x in lines[k + 1 :] if x["span"]), len(B))
        while b + 1 < min(nxt, b + 6) and not re.search(r"[.?!]$", toks[owner[b]]) and toks[owner[b]] != "|":
            b += 1
        l["t"] = book_text(a, b)
    for l in lines:
        for a, b in (("every- where", "everywhere"), ("astro- nauts", "astronauts"), ("high- tech", "high-tech")):
            l["t"] = l["t"].replace(a, b)
    lines = [l for l in lines if not re.fullmatch(r"[A-Z]{3,}|Celebrations", l["t"])]  # 网页截图上的菜单字
    miss = [l["t"] for l in lines if not l["span"]]
    for l in lines:
        del l["span"]
    return lines, miss


# 参考译文（老师可改）：scripts/lessons_zh.tsv，每行「英文<Tab>中文」
ZH = {}
for row in open(os.path.join(os.path.dirname(__file__), "lessons_zh.tsv"), encoding="utf-8"):
    if row.strip() and not row.startswith("#") and "\t" in row:
        en, zh = row.rstrip("\n").split("\t", 1)
        ZH[en.strip()] = zh.strip()

data = json.load(open(words_json, encoding="utf-8"))
units, unsure, skipped, no_zh = {}, [], [], []
for name, words in data.items():
    p = parse(name)
    if not p or not words:
        continue
    unit, lid, title, order = p
    if "-pron-" in lid:
        continue  # 语音板块是字母、音标、单词跟读，不是课文
    lines, miss = build(words, True)
    if not lines:  # 没听到「Listen and …」这类题目要求，就不跳开头
        lines, miss = build(words, False)
    if not lines or len(miss) > len(lines) * 0.5:
        skipped.append(f"{lid}（{len(miss)}/{len(lines)} 句对不上课本）")
        continue
    unsure += [f"{lid}  {m}" for m in miss]
    for l in lines:
        if l["t"] in ZH:
            l["zh"] = ZH[l["t"]]
        else:
            no_zh.append(l["t"])
    units.setdefault(unit, []).append((order, {"id": lid, "title": title, "audio": f"lessons/{BOOK}/{lid}.mp3", "lines": lines}))


def unit_order(u):
    return (0 if u.startswith("starter") else 1, int(u.rsplit("-", 1)[1]))


out = {"units": [{"unit": u, "lessons": [l for _, l in sorted(ls, key=lambda x: x[0])]} for u, ls in sorted(units.items(), key=lambda x: unit_order(x[0]))]}
dest = os.path.join(ROOT, f"public/data/{BOOK}-lessons.json")
json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
total = sum(len(l["lines"]) for u in out["units"] for l in u["lessons"])
print(f"{sum(len(u['lessons']) for u in out['units'])} 段，{total} 句；{len(unsure)} 句对不上课本（保留识别文字）：")
print("\n".join(unsure))
if no_zh:
    print(f"\n还没有译文的 {len(set(no_zh))} 句：")
    print("\n".join(dict.fromkeys(no_zh)))
print(f"\n没放进点读的 {len(skipped)} 段（字母、数字、音标跟读等）：")
print("\n".join(skipped))
