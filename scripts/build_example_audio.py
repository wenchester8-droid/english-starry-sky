"""给单词卡的两句例句录朗读（课本句 → ex，中考句 → ex2）。

例句在 scripts/examples7a.json，老师可以直接改；改过的句子会按新文字重新录，没改的不重录。
用微软神经网络英音（Sonia、Ryan、Libby 三个声音轮流），见 neural_tts.py。
用法: EDGE_TTS=<edge-tts 路径> python scripts/build_example_audio.py ffmpeg路径 [册号，默认 7a]
"""
import hashlib, json, os, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from neural_tts import VOICES, record, voice_for  # noqa: E402

CACHE = os.path.join(HERE, "build", "ex_audio_ms")


def cache_path(slot, wid, text):
    v = voice_for(f"{wid}/{slot}")
    h = hashlib.md5(f"{VOICES[v]}|{text}".encode()).hexdigest()[:8]
    return os.path.join(CACHE, slot, f"{wid}-{h}.mp3")


if __name__ == "__main__":
    ffmpeg = sys.argv[1]
    book = sys.argv[2] if len(sys.argv) > 2 else "7a"
    data = json.load(open(os.path.join(HERE, f"examples{book}.json")))
    jobs = []
    for wid, ex in data.items():
        for slot in ("tb", "zk"):
            dest = cache_path(slot, wid, ex[slot]["en"])
            if not os.path.exists(dest):
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                jobs.append((ex[slot]["en"], dest, voice_for(f"{wid}/{slot}")))
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda j: record(j[0], j[1], j[2], ffmpeg), jobs))
    print("新录了", len(jobs), "段")
