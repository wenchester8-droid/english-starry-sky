"""用 ffmpeg silencedetect 把录音切成语音片段。"""
import re, subprocess, sys


def segs(ffmpeg, path, noise="-35dB", d="0.35"):
    out = subprocess.run([ffmpeg, "-hide_banner", "-i", path, "-af", f"silencedetect=noise={noise}:d={d}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    dur = int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3])
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    res, t = [], 0.0
    for s, e in zip(st, en + [dur]):
        if s - t > 0.08:
            res.append((round(t, 3), round(s, 3)))
        t = e
    if dur - t > 0.15:
        res.append((round(t, 3), round(dur, 3)))
    return res


if __name__ == "__main__":
    for p in sys.argv[2:]:
        r = segs(sys.argv[1], p)
        print(p, len(r), [round(b - a, 2) for a, b in r][:14])
