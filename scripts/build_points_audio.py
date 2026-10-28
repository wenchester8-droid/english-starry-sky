"""给考点的课本例句和练习题配朗读。

每道题把空填上正确答案，拼成完整句子（对话题按行分开，两个人用不同声音），
用微软神经网络英音（Sonia、Ryan、Libby 轮流，见 neural_tts.py）朗读。完整句子写回 public/data/7a-points.json 的 "s" 字段，
网页答完题后显示并朗读。
用法: EDGE_TTS=<edge-tts 路径> python scripts/build_points_audio.py ffmpeg路径 [册号，默认 7a]
"""
import json, os, re, sys
from concurrent.futures import ThreadPoolExecutor

ffmpeg = sys.argv[1]
BOOK = sys.argv[2] if len(sys.argv) > 2 else "7a"
HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(WEB), "app", "public", "data", f"{BOOK}-points.json")
OUT_JSON = os.path.join(WEB, "public", "data", f"{BOOK}-points.json")
OUT_DIR = os.path.join(WEB, "public", "audio", "points")
BLANK = re.compile(r"_{2,}")
CJK = re.compile(r"[一-鿿]")


def has_latin(s):
    return bool(re.search(r"[A-Za-z]{2,}", s))


def strip_hints(s):
    """去掉题干里的提示：(be)、(you)、（困难但是重要）这类括号。"""
    s = re.sub(r"\s*（[^）]*）", "", s)
    s = re.sub(r"\s*\((?:[a-z]+)\)", "", s)
    return s


def fill(stem, answers):
    parts = BLANK.split(stem)
    out = parts[0]
    for i, rest in enumerate(parts[1:]):
        out += (answers[i] if i < len(answers) else answers[-1]) + rest
    return out


def full_sentence(q):
    """返回要朗读的完整句子（可能是多行对话）；纯中文题返回 None。"""
    if q["t"] == "order":
        return q["a"]
    if q["t"] == "choice":
        ans = q["o"][q["a"]]
        stem = q["q"]
        if BLANK.search(stem) and has_latin(BLANK.sub("", stem)):
            parts = [a.strip() for a in ans.split(";")] if ";" in ans else [ans]
            parts = ["" if p == "/" else p for p in parts]
            return strip_hints(fill(stem, parts))
        return ans if has_latin(ans) and not CJK.search(ans) else None
    # fill：空后面紧跟的括号是提示词（如 "(be)"、"(Teng Fei)"），朗读时去掉
    stem = re.sub(r"(_{2,})\s*\([^)]*\)", r"\1", q["q"])
    if CJK.search(BLANK.sub("", strip_hints(stem))):
        return q["a"][0]
    return strip_hints(fill(stem, [q["a"][0]]))


def tidy(s):
    s = re.sub(r"\s+([.,?!])", r"\1", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


sys.path.insert(0, HERE)
from neural_tts import record, voice_for  # noqa: E402


os.makedirs(OUT_DIR, exist_ok=True)
data = json.load(open(SRC))
jobs = []
for u in data["units"]:
    for p in u["points"]:
        for i, ex in enumerate(p["examples"]):
            name = f"{p['id']}-ex{i}"
            jobs.append((ex["en"], name))
        for i, q in enumerate(p["questions"]):
            s = full_sentence(q)
            if not s:
                continue
            q["s"] = tidy(s)
            jobs.append((q["s"], f"{p['id']}-q{i}"))
json.dump(data, open(OUT_JSON, "w"), ensure_ascii=False, indent=2)
todo = [(t, n) for t, n in jobs if not os.path.exists(os.path.join(OUT_DIR, n + ".mp3"))]
with ThreadPoolExecutor(4) as pool:
    list(pool.map(lambda j: record(j[0], os.path.join(OUT_DIR, j[1] + ".mp3"), voice_for(j[1]), ffmpeg), todo))
print("新录了", len(todo), "段")
