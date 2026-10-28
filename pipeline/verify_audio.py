"""用语音识别听一遍切好的单词录音，找出可能对错的词条。

用法: python verify_audio.py ffmpeg路径 whisper模型目录 public/data/7a.json public目录
需要 faster-whisper（Python 3.12）。识别结果和词条差得多的会列出来，再人工确认。
"""
import difflib, json, os, re, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel

ffmpeg, model_dir, book_path, public = sys.argv[1:5]
m = WhisperModel(model_dir, device="cpu", compute_type="int8")
book = json.load(open(book_path))


def load(path):
    raw = subprocess.run([ffmpeg, "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def norm(s):
    return re.sub(r"[^a-z ]", "", s.lower().replace("’", "'").replace("'", "")).strip()


bad = []
for u in book["units"]:
    for w in u["words"]:
        segs, _ = m.transcribe(load(os.path.join(public, w["audio"])), language="en", beam_size=5, vad_filter=False)
        heard = " ".join(s.text for s in segs).strip()
        target = norm(re.sub(r"\(.*?\)", "", w["w"]))
        sim = difflib.SequenceMatcher(None, norm(heard).replace(" ", ""), target.replace(" ", "")).ratio()
        if sim < 0.6:
            bad.append((u["title"], w["w"], heard, round(sim, 2)))
        print(f"{u['title']:<15} {w['w']:<28} {heard:<30} {sim:.2f}", flush=True)
print("\n可疑：", len(bad))
for b in bad:
    print(*b, sep=" | ")
