"""把新的河南模拟卷（Word）加进真题统计：取文字 → 和已有卷子比对去重 → 写进 build/exam_txt/mock/ 和 build/mock_papers.json。

用法: python add_mock_papers.py <放 docx 的文件夹>...    （加 --dry 只看结果不写文件）
之后每册重新运行 build_exams.py。
"""
import json, os, re, sys, zipfile
from html import unescape

HERE = os.path.dirname(os.path.abspath(__file__))
TXT = os.path.join(HERE, "build", "exam_txt")
LIST = os.path.join(HERE, "build", "mock_papers.json")


def docx_text(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf8")
    lines = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        p = re.sub(r"<w:tab/>", " ", p)
        p = re.sub(r"<w:br/>", "\n", p)
        t = unescape("".join(re.findall(r"<w:t(?: [^>]*)?>(.*?)</w:t>", p, re.S)))
        if t.strip():
            lines.append(t.strip())
    return "\n".join(lines)


def shingles(text):
    words = re.findall(r"[a-z]+", text.lower())
    return {" ".join(words[i:i + 8]) for i in range(len(words) - 7)}


def same(a, b):
    """两份卷子共有的 8 词片段占较小那份的比例。"""
    return len(a & b) / max(1, min(len(a), len(b)))


def main():
    dry = "--dry" in sys.argv
    dirs = [d for d in sys.argv[1:] if d != "--dry"]
    papers = json.load(open(LIST))
    known = [(p["title"], shingles(open(os.path.join(TXT, p["file"])).read())) for p in papers]
    for f in os.listdir(TXT):
        if f.endswith(".txt") and "答案" not in f:
            known.append((f[:-4], shingles(open(os.path.join(TXT, f)).read())))
    files = sorted({os.path.join(r, f) for d in dirs for r, _, fs in os.walk(d) for f in fs
                    if f.endswith(".docx") and not f.startswith("~$")})
    added = dup = 0
    for path in files:
        title = re.sub(r"^\d+_", "", os.path.basename(path))[:-5].strip()
        text = docx_text(path)
        sh = shingles(text)
        if len(sh) < 300:
            print("文字太少，跳过（可能是扫描件）:", title)
            continue
        best = max(known, key=lambda k: same(sh, k[1]))
        score = same(sh, best[1])
        # 乡镇卷常整篇借用别的卷子的阅读，一半相同还算两份；八成以上相同才是同一份卷子
        if score > 0.8:
            print(f"重复 {score:.0%}: {title}  ≈ {best[0]}")
            for p in papers:
                if p["title"] == best[0] and title not in p["dups"]:
                    p["dups"].append(title)
            dup += 1
            continue
        m = re.search(r"(20\d\d)", title) or re.search(r"(20\d\d)", path)
        year = int(m.group(1))
        if re.search(r"20(\d\d)-(?:20)?(\d\d)", title):  # 2025-26 学年 → 2026
            year = 2000 + int(re.search(r"20(\d\d)-(?:20)?(\d\d)", title).group(2))
        if any(p["title"] == title for p in papers):  # 同名不同卷
            title += "（第2份）"
        fname = f"mock/mock_{len(papers):03d}.txt"
        if not dry:
            open(os.path.join(TXT, fname), "w").write(title + "\n" + text)
        papers.append({"title": title, "year": year, "file": fname, "dups": []})
        known.append((title, sh))
        added += 1
        print(f"新增 {year}: {title}  (最像 {best[0]} {score:.0%})")
    if not dry:
        json.dump(papers, open(LIST, "w"), ensure_ascii=False, indent=1)
    print(f"新增 {added} 份，重复 {dup} 份，现在共 {len(papers)} 份模拟卷")


main()
