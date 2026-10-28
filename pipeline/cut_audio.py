"""按 align_audio.py 的对齐结果，把每个词条的第一遍朗读剪成单独的 mp3。

用法: python cut_audio.py ffmpeg路径 对齐结果.json 录音目录 输出目录
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ffmpeg, align_path, audio_dir, out_dir = sys.argv[1:5]
os.makedirs(out_dir, exist_ok=True)
align = json.load(open(align_path))


def cut(a):
    start = max(0, a["start"] - 0.06)
    end = a["end"] + 0.15
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
                    "-i", os.path.join(audio_dir, a["file"]), "-ac", "1", "-b:a", "64k",
                    "-af", "afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse",
                    os.path.join(out_dir, a["id"] + ".mp3")], check=True)


with ThreadPoolExecutor(8) as ex:
    list(ex.map(cut, align.values()))
print(len(align), "files")
