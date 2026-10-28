"""把课文点读用到的课本录音压缩后拷到 public/lessons/<册号>/（单声道 48k，和其他册一样）。

用法: python3 scripts/copy_lesson_audio.py ffmpeg路径 录音目录 册号
只拷 public/data/<册号>-lessons.json 里用到的段；已经拷过的跳过。
"""
import glob, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lesson_files import parse  # noqa: E402

ffmpeg, src_dir, book = sys.argv[1:4]
web = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
want = {l["id"] for u in json.load(open(os.path.join(web, "public", "data", f"{book}-lessons.json")))["units"] for l in u["lessons"]}
out = os.path.join(web, "public", "lessons", book)
os.makedirs(out, exist_ok=True)
jobs = []
for f in glob.glob(os.path.join(src_dir, "*.mp3")):
    p = parse(os.path.basename(f))
    if p and p[1] in want and not os.path.exists(os.path.join(out, p[1] + ".mp3")):
        jobs.append((f, os.path.join(out, p[1] + ".mp3")))


def run(j):
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", j[0], "-ac", "1", "-b:a", "48k", j[1]], check=True)


with ThreadPoolExecutor(6) as ex:
    list(ex.map(run, jobs))
print("拷了", len(jobs), "段；共", len(want), "段")
