"""真题阅读馆试点：把卷子的阅读理解拆成一篇篇文章，按「七上学生认识的词」算生词率，分级。

认识的词 = 七上词表 + 七上课本全文 + 课文点读里出现过的所有词。
小学学过、但七上课本没出现的词会被算成生词，所以生词率会略偏高。
括号里带中文注释的词（如 facilities (场所)）算认识；人名地名不算。

先跑 parse_papers.py 拆卷，再跑本脚本。
用法: python reading_pilot.py build/reading_pilot.json
"""
import json, os, re, sys

from reading_common import *  # noqa: F401,F403

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
EXAM_TXT = os.path.join(HERE, "build", "exam_txt")
ZT = os.path.join(ROOT, "真题")

# ---------- 文章（parse_papers.py 拆好的） ----------
papers = json.load(open(os.path.join(HERE, "build", "papers_reading.json")))
out = []
for p in papers:
    body = [re.sub(r"\[图:[^\]]*\]", " ", l) for l in p["body"]]
    for tier, kn in TIERS.items():
        total, n_unk, unk = analyse(body, kn)
        rate = n_unk / total if total else 1
        p[tier] = {"rate": round(rate, 3), "level": level(rate), "unknownWords": unk}
    out.append(p)

json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
from collections import Counter
for tier in TIERS:
    print(tier, Counter(p[tier]["level"] for p in out), "共", len(out), "篇")
