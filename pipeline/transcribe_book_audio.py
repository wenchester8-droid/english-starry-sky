"""把课本的课文、对话、听力录音逐词转成文字，带时间（用来从原声里剪出课本例句）。

用法: python transcribe_book_audio.py ffmpeg路径 whisper模型目录 录音目录 输出.json
需要 Python 3.12 + faster-whisper。已经转过的文件会跳过，可以断点续跑。
"""
import glob, json, os, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel

ffmpeg, model_dir, audio_dir, out = sys.argv[1:5]
model = WhisperModel(model_dir, device="cpu", compute_type="int8")
done = json.load(open(out)) if os.path.exists(out) else {}

for path in sorted(glob.glob(os.path.join(audio_dir, "*.mp3"))):
    name = os.path.basename(path)
    if name.startswith("Vocabulary") or name in done:
        continue
    raw = subprocess.run([ffmpeg, "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    segs, _ = model.transcribe(audio, language="en", beam_size=5, word_timestamps=True, vad_filter=True)
    words = [[w.word.strip(), round(w.start, 2), round(w.end, 2)] for s in segs for w in (s.words or [])]
    done[name] = words
    json.dump(done, open(out, "w"), ensure_ascii=False)
    print(name, len(words), flush=True)
print("完成", len(done))
