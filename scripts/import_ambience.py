"""
把下载来的音乐素材做成网页用的环境音乐：
- 去掉开头结尾的静音；
- 太短的（不到 100 秒）首尾交叉拼接，拼到 2 分钟左右；太长的截到 3 分钟以内；
- 结尾和开头交叉淡化，循环播放听不出接缝；
- 输出 public/sfx/amb-<名字>.mp3，并打印响度，用来填 src/lib/sound.ts 里的 db。

用法: python3 scripts/import_ambience.py <ffmpeg路径> <素材文件夹> 名字1 名字2 ...
素材文件夹里要有 <名字>.mp3
"""
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
FADE = 3.0  # 接缝处交叉淡化的秒数
OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"
TARGET = -27.0  # 目标响度 LUFS


def decode(ffmpeg: str, path: Path) -> np.ndarray:
    raw = subprocess.run([ffmpeg, "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def trim_silence(x: np.ndarray) -> np.ndarray:
    level = np.max(np.abs(x), axis=1)
    loud = np.where(level > 10 ** (-50 / 20))[0]
    return x[loud[0] : loud[-1] + 1] if len(loud) else x


def crossfade_join(a: np.ndarray, b: np.ndarray, f: int) -> np.ndarray:
    ramp = np.linspace(0, 1, f)[:, None]
    mid = a[-f:] * np.sqrt(1 - ramp) + b[:f] * np.sqrt(ramp)
    return np.concatenate([a[:-f], mid, b[f:]])


def make_loop(x: np.ndarray) -> np.ndarray:
    f = int(SR * FADE)
    x = trim_silence(x)
    # 太短：自己和自己交叉拼接，每次从不同位置接，减少重复感
    while len(x) < SR * 100:
        x = crossfade_join(x, np.roll(x, len(x) // 3, axis=0), f)
    # 太长：截到 3 分钟
    x = x[: int(SR * 180) + f]
    # 结尾 f 秒淡入到开头，得到无缝循环
    body = x[:-f].copy()
    ramp = np.linspace(0, 1, f)[:, None]
    body[:f] = x[-f:] * np.sqrt(1 - ramp) + body[:f] * np.sqrt(ramp)
    return body


def encode(ffmpeg: str, x: np.ndarray, out: Path):
    peak = np.max(np.abs(x))
    if peak > 0.98:
        x = x / peak * 0.98
    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", "-codec:a", "libmp3lame", "-b:a", "128k", str(out)],
        input=x.astype(np.float32).tobytes(),
        check=True,
    )


def loudness(ffmpeg: str, path: Path) -> float:
    err = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    vals = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return float(vals[-1])


if __name__ == "__main__":
    ffmpeg, src, *names = sys.argv[1:]
    for name in names:
        x = decode(ffmpeg, Path(src) / f"{name}.mp3")
        loop = make_loop(x)
        out = OUT / f"amb-{name}.mp3"
        encode(ffmpeg, loop, out)
        # 直接把文件本身调到目标响度（太轻的放大、太响的压小），网页里就不用再大幅补音量
        gain = 10 ** ((TARGET - loudness(ffmpeg, out)) / 20)
        peak = np.max(np.abs(loop)) * gain
        if peak > 0.95:
            gain *= 0.95 / peak
        encode(ffmpeg, loop * gain, out)
        lufs = loudness(ffmpeg, out)
        print(f"{name}\t{len(loop) / SR:.0f}s\t{lufs:.1f} LUFS\tdb={TARGET - lufs:+.1f}")
