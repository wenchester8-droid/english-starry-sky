"""用语音识别对齐课本单词录音（比 align_audio.py 只看时长更可靠）。

先按静音切出片段，逐段识别成文字；再按词表顺序做动态规划，
每个词条对应 1–3 个连续片段（短语中间可能有停顿），使识别文字和词条最相似。
录音里多出来的片段（单元标题、第二遍朗读、kilogram 之类的变体）会被跳过。

用法: python align_whisper.py ffmpeg路径 whisper模型目录 public/data/7a.json 录音目录 对齐结果.json
需要 faster-whisper（Python 3.12）。
"""
import difflib, json, os, re, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel

sys.path.insert(0, os.path.dirname(__file__))
from segs import segs  # noqa: E402

ffmpeg, model_dir, book_path, audio_dir, out = sys.argv[1:6]

# 识别听错导致对齐偏掉、经人工核对后的位置（秒）
OVERRIDES = {"unit-6/dark": (138.065, 138.545), "unit-1/re": (118.152, 118.498),
             # 八上（align8a.json）
             "unit-4/weigh": (108.791, 109.205), "unit-5/pie": (188.636, 189.102), "unit-6/law": (110.174, 110.65),
             "unit-6/bath": (114.061, 114.599), "unit-7/cure": (122.859, 123.236),
             "unit-1/ready-to-do-sth": (93.105, 94.264), "unit-2/add-sth-to-sth": (51.596, 52.987),
             # 九年级（align9.json）
             "unit-1/kenyan": (151.271, 151.69), "unit-4/in-sbs-case": (90.692, 92.468),
             "unit-4/divide-sth-into": (264.557, 266.295), "unit-7/fair": (215.373, 215.808),
             # 七下（align7b.json）
             "unit-1/fur": (172.89, 173.33), "unit-4/too-to": (167.96, 168.87), "unit-8/truth": (86.23, 86.65),
             # 八下（align8b.json）：ache、aid 被听成 eight，nearby 听成 goodbye，merci 听成 thank you
             "unit-2/ache": (72.96, 73.33), "unit-2/aid": (274.04, 274.44), "unit-5/nearby": (180.18, 180.87),
             "unit-6/merci": (180.79, 181.43), "unit-6/t-rkiye": (293.49, 294.16)}
model = WhisperModel(model_dir, device="cpu", compute_type="int8")
book = json.load(open(book_path))


def load(path):
    raw = subprocess.run([ffmpeg, "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower().replace("’", "").replace("'", ""))


def sim(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0.0


result = {}
for u in book["units"]:
    fname = os.path.join(audio_dir, f"Vocabulary in Each Unit_{u['title']}.mp3")
    if not os.path.exists(fname):  # 七下、八下的文件名中间是空格
        fname = os.path.join(audio_dir, f"Vocabulary in Each Unit {u['title']}.mp3")
    audio = load(fname)
    seg = segs(ffmpeg, fname)
    texts = []
    for s, e in seg:
        clip = audio[int(max(0, s - 0.05) * 16000): int((e + 0.05) * 16000)]
        r, _ = model.transcribe(clip, language="en", beam_size=5, vad_filter=False, without_timestamps=True)
        texts.append(norm(" ".join(x.text for x in r)))
    targets = [norm(re.sub(r"\(.*?\)|sb|sth", "", w["w"].split("/")[0])) for w in u["words"]]

    M, N = len(seg), len(targets)
    NEG = -1e9
    best = [[NEG] * (N + 1) for _ in range(M + 1)]
    back = [[None] * (N + 1) for _ in range(M + 1)]
    best[0][0] = 0.0
    for i in range(M + 1):
        for j in range(N + 1):
            v = best[i][j]
            if v == NEG:
                continue
            if i < M and v > best[i + 1][j]:
                best[i + 1][j], back[i + 1][j] = v, (i, j, 0)
            if j < N:
                for k in (1, 2, 3):
                    if i + k > M or seg[i + k - 1][0] - seg[i][1] > 2.5:
                        break
                    sc = sim("".join(texts[i:i + k]), targets[j]) - 0.15 * (k - 1)
                    if v + sc > best[i + k][j + 1]:
                        best[i + k][j + 1], back[i + k][j + 1] = v + sc, (i, j, k)
    i, j, picks = M, N, [None] * N
    while j > 0 or i > 0:
        pi, pj, k = back[i][j]
        if k:
            picks[pj] = (pi, k)
        i, j = pi, pj
    low = []
    for jj, (w, (si, k)) in enumerate(zip(u["words"], picks)):
        heard = "".join(texts[si:si + k])
        sc = sim(heard, targets[jj])
        start, end = OVERRIDES.get(f"{u['id']}/{w['id']}", (seg[si][0], seg[si + k - 1][1]))
        result[f"{u['id']}/{jj}"] = {"id": w["id"], "w": w["w"], "file": os.path.basename(fname),
                                     "start": start, "end": end, "heard": heard, "score": round(sc, 2)}
        if sc < 0.6:
            low.append(f"{w['w']}≈{heard}")
    print(f"{u['title']}: {len(seg)} 段 / {N} 词；识别相似度低的：{low}", flush=True)
json.dump(result, open(out, "w"), ensure_ascii=False, indent=1)
