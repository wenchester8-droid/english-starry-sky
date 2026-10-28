"""给新一册的单词找例句候选，再把挑好的结果存成 web/scripts/examples<册号>.json。

  python3 ex_pick.py show <册号> <从第几个> <几个>     列出候选：T1..T3 课本原句，Z1..Z3 中考/模拟卷原句
  python3 ex_pick.py save <册号> <挑选.txt>            挑选.txt 每行「id|课本句|中文|中考句|中文」
      句子位置写 T2 / Z1 表示用候选原句（出处自动标「课本」或卷名）；
      写 =英文句子 表示自己写的（标「拓展」），写 ~英文句子 表示改编过的（标「改编」）。
课本句必须逐字出现在课本全文里，卷子句必须逐字出现在卷子里——都是从原文切出来的，所以自动满足。
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
WEB = os.path.join(os.path.dirname(APP), "web")


def sentences(text):
    text = re.sub(r"=====PAGE \d+", "\n", text).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"[ \t ​]+", " ", text)
    out = []
    for para in re.split(r"\n\s*\n|\n(?=[A-Z][a-z]+:)", text):
        para = re.sub(r"\s*\n\s*", " ", para)
        para = re.sub(r"^[A-Z][A-Za-z ]{0,20}:\s+", "", para.strip())
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"])", para):
            s = s.strip()
            n = len(s.split())
            # 去掉选项、题号、说话人标签（「Fu Xing: Peter:」）、末尾粘着题号（「happily.21.」）的句子
            junk = r"[一-鿿_．，]|\(\d|\d\)|__|[A-D]\.|\w ?: |\s\d+[a-z]?\b|\.\w*\d+\.$|\.[a-z]\.$|Listen|repeat\."
            if 5 <= n <= 20 and re.match(r"^[A-Z\"]", s) and s[-1] in ".!?\"" and not re.search(junk, s):
                out.append(s)
    return out


def forms(w):
    w = w.lower().replace("’", "'")
    w = re.sub(r"\(.*?\)", "", w).split("/")[0].strip(" .?!")
    words = [x for x in w.split() if x not in ("sb", "sth", "sb's", "…", "...", "……", "one's")]
    if not words:
        return None
    head, rest = words[0], words[1:]
    alts = {head, head + "s", head + "es", head + "ed", head + "ing"}
    if head.endswith("e"):
        alts |= {head + "d", head[:-1] + "ing"}
    if head.endswith("y"):
        alts |= {head[:-1] + "ies", head[:-1] + "ied"}
    if len(head) > 2 and head[-1] not in "aeiouwxy" and head[-2] in "aeiou" and head[-3] not in "aeiou":
        alts |= {head + head[-1] + "ed", head + head[-1] + "ing"}
    pat = r"\b(" + "|".join(sorted(map(re.escape, alts), key=len, reverse=True)) + r")\b"
    for r in rest:
        pat += r"(?:\s+\w+){0,3}?\s+" + re.escape(r) + r"\b"
    return re.compile(pat, re.I)


def label(title, year):
    if "中考" in title and "模拟" not in title:
        return f"{year}年河南中考"
    m = re.search(r"省(\w{2,3}?)市", title)
    return f"{year} {m.group(1) if m else '河南'}模拟"


def load(book):
    words = [w for u in json.load(open(os.path.join(APP, "public", "data", f"{book}.json")))["units"] for w in u["words"] if not w["proper"]]
    full = open(os.path.join(HERE, f"book{book}_full.txt"), encoding="utf-8").read()
    tb = sentences(full[: full.find("Vocabulary in Each Unit", len(full) // 3)])  # 第一次出现是目录，取词表页之前的正文
    zk = []
    for p in json.load(open(os.path.join(HERE, "mock_papers.json"))):
        f = os.path.join(HERE, "exam_txt", p["file"])
        if os.path.exists(f):
            zk += [(s, label(p["title"], p["year"])) for s in sentences(open(f, encoding="utf-8").read())]
    for y in (2022, 2023, 2024):
        f = os.path.join(HERE, "exam_txt", f"{y}河南中考.txt")
        zk += [(s, f"{y}年河南中考") for s in sentences(open(f, encoding="utf-8").read())]
    return words, tb, zk


def cands(w, tb, zk):
    rx = forms(w["w"])
    if not rx:
        return [], []
    t = sorted({s for s in tb if rx.search(s)}, key=lambda s: abs(len(s.split()) - 10))[:3]
    seen, z = set(), []
    for s, src in sorted(zk, key=lambda x: (abs(len(x[0].split()) - 12), -int(x[1][:4]))):
        if rx.search(s) and s not in seen:
            seen.add(s)
            z.append((s, src))
            if len(z) == 3:
                break
    return t, z


if __name__ == "__main__":
    cmd, book = sys.argv[1], sys.argv[2]
    words, tb, zk = load(book)
    if cmd == "show":
        a, n = int(sys.argv[3]), int(sys.argv[4])
        for w in words[a:a + n]:
            t, z = cands(w, tb, zk)
            print(f"## {w['id']} | {w['w']} | {w['zh'][:20]}")
            for i, s in enumerate(t, 1):
                print(f"  T{i} {s}")
            for i, (s, src) in enumerate(z, 1):
                print(f"  Z{i} {s} [{src}]")
        print(f"(共 {len(words)} 词)")
    elif cmd == "save":
        out_path = os.path.join(WEB, "scripts", f"examples{book}.json")
        data = json.load(open(out_path)) if os.path.exists(out_path) else {}
        byid = {w["id"]: w for w in words}
        bad = []
        for line in open(sys.argv[3], encoding="utf-8"):
            if not line.strip() or line.startswith("#"):
                continue
            wid, a, az, b, bz = [x.strip() for x in line.rstrip("\n").split("|")]
            if wid not in byid:
                bad.append(f"没有这个词：{wid}")
                continue
            t, z = cands(byid[wid], tb, zk)

            def pick(code, zh):
                if code.startswith("="):
                    return {"en": code[1:].strip(), "zh": zh, "src": "拓展"}
                if code.startswith("~"):
                    return {"en": code[1:].strip(), "zh": zh, "src": "改编"}
                if code.startswith("T:"):  # 直接写课本原句（必须逐字在课本里）
                    s = code[2:].strip()
                    assert s in tb, f"{wid}: 课本里没有这句：{s}"
                    return {"en": s, "zh": zh, "src": "课本"}
                if code.startswith("Z:"):
                    s = code[2:].strip()
                    hit = [src for x, src in zk if x == s]
                    assert hit, f"{wid}: 卷子里没有这句：{s}"
                    return {"en": s, "zh": zh, "src": hit[0]}
                n = int(code[1:])
                assert n <= len(t if code[0] == "T" else z), f"{wid}: 没有候选 {code}"
                if code[0] == "T":
                    return {"en": t[n - 1], "zh": zh, "src": "课本"}
                s, src = z[n - 1]
                return {"en": s, "zh": zh, "src": src}
            data[wid] = {"tb": pick(a, az), "zk": pick(b, bz)}
        json.dump(data, open(out_path, "w"), ensure_ascii=False, indent=1)
        print("已存", len(data), "/", len(words), "词", *bad, sep="\n")
