"""从开源词库「词光 Word Atlas」(CC BY 4.0) 下载七上单词的插画、美音和例句。

https://github.com/designfuchen/word-atlas  署名：Word Atlas contributors（词光）
用法: python fetch_word_atlas.py public/data/7a.json public 输出对照表.json
只下载缺的文件，可以反复运行（网络不好时断点续传）。
"""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

book_path, public, out = sys.argv[1:4]
BASES = ["https://cdn.jsdelivr.net/gh/designfuchen/word-atlas@main/public/atlas/",
         "https://raw.githubusercontent.com/designfuchen/word-atlas/main/public/atlas/"]


def get(path, dest=None):
    for attempt in range(4):
        for base in BASES:
            try:
                with urllib.request.urlopen(base + path, timeout=60) as r:
                    data = r.read()
                if dest:
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    open(dest, "wb").write(data)
                return data
            except Exception as e:  # noqa: BLE001
                err = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{path}: {err}")


idx = json.loads(get("index.json"))
rows = {}
for n, r in enumerate(idx["words"]):
    rows.setdefault(r[1].lower(), (n, r))
    rows.setdefault(r[0], (n, r))

book = json.load(open(book_path))
want = {}
for u in book["units"]:
    for w in u["words"]:
        hit = rows.get(w["w"].lower().replace("’", "'")) or rows.get(w["id"])
        if hit and not w["proper"]:
            want[w["id"]] = hit

chunk_size = idx.get("chunk", 100)
chunks = {}
for n, _ in want.values():
    c = n // chunk_size
    if c not in chunks:
        chunks[c] = json.loads(get(f"entries/{c}.json"))

result, jobs = {}, []
for wid, (n, r) in want.items():
    aid, media = r[0], r[6]
    entries = chunks[n // chunk_size]
    entry = entries[n % chunk_size] if isinstance(entries, list) else entries["words"][n % chunk_size]
    item = {"src": aid}
    if entry.get("ex"):
        item["ex"] = entry["ex"][0]
    for bit, sub, key, ext in ((1, "thumb", "img", "webp"), (1, "img", "imgFull", "webp"), (4, "audio/us", "us", "mp3"), (8, "audio/ex", "exAudio", "mp3")):
        if media & bit:
            rel = f"wa/{sub.split('/')[-1]}/{wid}.{ext}"
            item[key] = rel
            dest = os.path.join(public, rel)
            if not os.path.exists(dest):
                jobs.append((f"{sub}/{aid}.{ext}", dest))
    result[wid] = item

print(len(result), "words,", len(jobs), "files to download", flush=True)
done = 0


def fetch(job):
    global done
    get(*job)
    done += 1
    if done % 50 == 0:
        print(done, "/", len(jobs), flush=True)


with ThreadPoolExecutor(6) as ex:
    list(ex.map(fetch, jobs))
json.dump(result, open(out, "w"), ensure_ascii=False, indent=1)
print("done")
