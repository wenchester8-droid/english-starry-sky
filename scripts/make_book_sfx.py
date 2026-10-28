"""合成「翻开一本书」的音效 public/sfx/book.mp3（换册过场用）。

一声封面落下的轻闷响 + 一串由快到慢的纸页沙沙声，约 0.9 秒，全部用噪声和正弦波合成，没有版权问题。
用法: python3 scripts/make_book_sfx.py <ffmpeg路径>
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "public" / "sfx" / "book.mp3"
rng = np.random.default_rng(7)


def bandpass(x, lo, hi):
    """频域里直接切出一段频率，够用而且不依赖 scipy。"""
    f = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    f[(freqs < lo) | (freqs > hi)] = 0
    return np.fft.irfft(f, len(x))


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / attack) * np.exp(-t / decay)


total = int(SR * 0.95)
out = np.zeros(total)

# 1. 封面翻开：很短的低频「噗」+ 一点木纸板的中频
n = int(SR * 0.25)
t = np.arange(n) / SR
thump = np.sin(2 * np.pi * (95 - 40 * t) * t) * env(n, 0.004, 0.06) * 0.7
thump += bandpass(rng.standard_normal(n), 300, 1800) * env(n, 0.002, 0.03) * 0.25
out[:n] += thump

# 2. 纸页沙沙：翻七页，越翻越慢、越来越轻
start, gap = 0.12, 0.055
for k in range(7):
    m = int(SR * (0.07 + 0.012 * k))
    s = int(SR * start)
    if s + m > total:
        break
    rustle = bandpass(rng.standard_normal(m), 1800, 7500) * env(m, 0.006, 0.025 + 0.004 * k)
    out[s : s + m] += rustle * (0.42 * 0.82**k)
    start += gap
    gap *= 1.22

# 收尾：淡出；峰值压到约 -20 dB，和网站其他提示音（-22～-29 dB）差不多响，稍明显一点
fade = int(SR * 0.12)
out[-fade:] *= np.linspace(1, 0, fade)
out /= np.max(np.abs(out)) / 0.1
pcm = (out * 32767).astype(np.int16)

tmp = OUT.with_suffix(".wav")
with wave.open(str(tmp), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
subprocess.run([sys.argv[1], "-hide_banner", "-loglevel", "error", "-y", "-i", str(tmp), "-b:a", "96k", str(OUT)], check=True)
tmp.unlink()
print("写好了", OUT)
