"""用微软神经网络英音朗读句子（edge-tts，免费，不用账号）。

三个声音轮流用：Sonia（女）、Ryan（男）、Libby（女）。对话句（以 — 分行）每行换一个声音，听起来像两个人在说话。
edge-tts 装在 Python 3.12 环境里，路径用环境变量 EDGE_TTS 指定，默认直接调用 edge-tts。
"""
import os, re, subprocess, tempfile, time, zlib

VOICES = ["en-GB-SoniaNeural", "en-GB-RyanNeural", "en-GB-LibbyNeural"]
EDGE_TTS = os.environ.get("EDGE_TTS", "edge-tts")


def voice_for(key: str) -> int:
    """按句子的编号固定挑一个起始声音，同一句每次重录都是同一个人读。"""
    return zlib.crc32(key.encode()) % len(VOICES)


def lines_of(text: str):
    if text.strip().startswith("—"):
        return [p.strip() for p in re.split(r"\s*—\s*", text) if p.strip()]
    return [l.strip() for l in text.split("\n") if l.strip()] or [text]


def _speak(line: str, voice: str, dest: str):
    for attempt in range(4):
        r = subprocess.run([EDGE_TTS, "--voice", voice, "--rate=-5%", "--text", line, "--write-media", dest],
                           capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(dest) and os.path.getsize(dest) > 1000:
            return
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"朗读失败：{line[:40]} {r.stderr[-200:]}")


def record(text: str, dest: str, start: int, ffmpeg: str):
    lines = [re.sub(r"^—\s*", "", l) for l in lines_of(text)]
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for i, line in enumerate(lines):
            f = os.path.join(tmp, f"{i}.mp3")
            _speak(line, VOICES[(start + i) % len(VOICES)], f)
            parts.append(f)
        args, filt = [], ""
        for i, f in enumerate(parts):
            args += ["-i", f]
            filt += f"[{i}:a]apad=pad_dur=0.35[a{i}];"
        filt += "".join(f"[a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
        part = dest + ".part.mp3"
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", *args, "-filter_complex", filt,
                        "-map", "[out]", "-ac", "1", "-b:a", "64k", part], check=True)
        os.replace(part, dest)
