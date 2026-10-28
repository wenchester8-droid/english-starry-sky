"""
用程序合成环境音乐（不用外部素材，没有版权问题）：棕噪声、八音盒、古筝。
每首约 2 分钟，首尾无缝衔接，可以一直循环。

用法: python3 scripts/make_ambience.py <ffmpeg路径>
输出: public/sfx/amb-brown.mp3、amb-musicbox.mp3、amb-guzheng.mp3
改完记得量一下响度，把 src/lib/sound.ts 里对应的 db 调到 -27 LUFS。
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
LEN = 120.0  # 每首长度（秒）
TAIL = 6.0  # 混响尾巴，叠回开头做无缝循环
OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"


def loop_fold(x: np.ndarray, n: int) -> np.ndarray:
    """把超出 n 的尾巴叠回开头，循环时就听不出接缝。"""
    y = x[:n].copy()
    tail = x[n:]
    y[: len(tail)] += tail
    return y


def reverb(x: np.ndarray, seconds=2.8, mix=0.35, seed=1) -> np.ndarray:
    """用衰减的噪声做冲激响应，模拟房间混响。"""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir[: int(SR * 0.012)] = 0  # 早期反射前留一点空
    ir /= np.sqrt(np.sum(ir**2))
    wet = np.fft.irfft(np.fft.rfft(x, len(x) + n) * np.fft.rfft(ir, len(x) + n))[: len(x)]
    return (1 - mix) * x + mix * wet


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def write(name: str, x: np.ndarray, ffmpeg: str):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.7
    stereo = np.stack([x, x], axis=1) if x.ndim == 1 else x
    pcm = (stereo * 32767).astype(np.int16)
    wav = OUT / f"amb-{name}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    mp3 = OUT / f"amb-{name}.mp3"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "128k", str(mp3)], check=True)
    wav.unlink()
    print("wrote", mp3.name)


# ---------- 棕噪声：低沉、柔和，像远处的风声或瀑布 ----------
def brown_seamless() -> np.ndarray:
    """生成长一点的棕噪声，再把结尾和开头交叉淡化，循环无缝。"""
    n = int(SR * LEN)
    f = int(SR * 4)
    rng = np.random.default_rng(7)
    chans = []
    for _ in range(2):
        b = np.cumsum(rng.standard_normal(n + f))
        k = int(SR * 0.5)
        b = b - np.convolve(b, np.ones(k) / k, mode="same")
        body = b[:n].copy()
        ramp = np.linspace(0, 1, f)
        body[:f] = b[n : n + f] * (1 - ramp) + b[:f] * ramp
        chans.append(body)
    x = np.stack(chans, axis=1)
    t = np.arange(n) / SR
    x *= (0.88 + 0.12 * np.sin(2 * np.pi * t / LEN * 3))[:, None]
    return x


# ---------- 八音盒：清脆的铃音，五声音阶，慢慢地弹 ----------
PENTA = [0, 2, 4, 7, 9]  # 宫商角徵羽


def note_freq(base_midi: int, step: int) -> float:
    octave, idx = divmod(step, 5)
    midi = base_midi + 12 * octave + PENTA[idx]
    return 440.0 * 2 ** ((midi - 69) / 12)


def bell(f: float, dur: float, amp: float) -> np.ndarray:
    t = np.arange(int(SR * dur)) / SR
    env = np.exp(-t * 2.2) * (1 - np.exp(-t * 400))
    # 八音盒的音色：基音 + 几个不太整齐的泛音
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 3) + 0.18 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 5)
    return amp * env * x


def musicbox() -> np.ndarray:
    n = int(SR * LEN)
    x = np.zeros(n + int(SR * TAIL))
    rng = np.random.default_rng(3)
    beat = 60 / 66  # 每分钟 66 拍，很慢
    step = 7  # 从中间音区开始
    t = 0.5
    while t < LEN - 0.5:
        # 旋律：小步走动，偶尔停一拍
        if rng.random() < 0.82:
            step = int(np.clip(step + rng.choice([-2, -1, -1, 1, 1, 2, 0]), 3, 13))
            f = note_freq(72, step)  # C5 附近
            s = bell(f, 4.0, 0.5 + 0.2 * rng.random())
            i = int(t * SR)
            x[i : i + len(s)] += s[: len(x) - i]
            # 每四拍配一个低音
            if int(round(t / beat)) % 4 == 0:
                lo = bell(note_freq(60, step % 5), 5.0, 0.35)
                x[i : i + len(lo)] += lo[: len(x) - i]
        t += beat * rng.choice([1, 1, 1, 0.5, 2])
    x = reverb(x, 3.2, 0.4, seed=5)
    return loop_fold(x, n)


# ---------- 古筝：拨弦（Karplus-Strong），五声音阶，偶尔一串刮奏 ----------
def pluck(f: float, dur: float, amp: float, rng, bright=0.5) -> np.ndarray:
    n = int(SR * dur)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    # 拨弦位置让声音不那么尖
    buf = lowpass(buf, 2000 + 4000 * bright)
    out = np.empty(n)
    decay = 0.996
    for i in range(n):
        v = buf[i % p]
        out[i] = v
        buf[i % p] = decay * 0.5 * (v + buf[(i + 1) % p])
    t = np.arange(n) / SR
    return amp * out * np.exp(-t * 0.6)


def guzheng() -> np.ndarray:
    """安静版：慢、稀、音色柔，刮奏很少（老师反馈原来太吵）。"""
    n = int(SR * LEN)
    x = np.zeros(n + int(SR * TAIL))
    rng = np.random.default_rng(11)
    beat = 60 / 48  # 每分钟 48 拍
    t = 0.6
    step = 6
    while t < LEN - 1:
        i = int(t * SR)
        r = rng.random()
        if r < 0.18:
            # 留白：这一拍不弹
            t += beat * rng.choice([1, 2])
            continue
        if r < 0.22:
            # 偶尔一串轻轻的上行刮奏
            start = int(rng.integers(2, 5))
            for k in range(6):
                s = pluck(note_freq(55, start + k), 2.5, 0.12, rng, 0.25)
                j = i + int(k * 0.08 * SR)
                x[j : j + len(s)] += s[: len(x) - j]
            t += beat * 4
            continue
        step = int(np.clip(step + rng.choice([-1, -1, 1, 1, -2, 2, 0]), 3, 10))
        s = pluck(note_freq(55, step), 4.0, 0.4, rng, 0.2)
        x[i : i + len(s)] += s[: len(x) - i]
        if rng.random() < 0.2:
            lo = pluck(note_freq(43, step % 5 + 2), 4.5, 0.25, rng, 0.15)
            x[i : i + len(lo)] += lo[: len(x) - i]
        t += beat * rng.choice([1, 1.5, 2, 2, 3])
    x = lowpass(x, 2600)  # 去掉刺耳的高音
    x = reverb(x, 3.2, 0.38, seed=9)
    return loop_fold(x, n)


if __name__ == "__main__":
    ffmpeg = sys.argv[1]
    only = sys.argv[2:]  # 可以只重做某几首：make_ambience.py <ffmpeg> guzheng
    for name, make in (("brown", brown_seamless), ("musicbox", musicbox), ("guzheng", guzheng)):
        if not only or name in only:
            write(name, make(), ffmpeg)
