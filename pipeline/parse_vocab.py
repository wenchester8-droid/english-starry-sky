import pymupdf, re, json, sys
pdf, first, last, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
d = pymupdf.open(pdf)
units = []; cur = None; buf = []; head_bold = None
def flush(page_ref, text=None):
    global buf, head_bold
    t = re.sub(r"\s+", " ", "".join(buf) if text is None else text).strip()
    if text is None: buf = []
    hb = head_bold; head_bold = None
    if not t: return
    # PDF 里页码偶尔排错位置，两条词粘在一起：「铁路 p.4attraction /əˈtrækʃn/ n. 向往的地方」→ 从页码处拆开
    m = re.search(r"\s*p\.(\d+)\s*(?=[A-Za-z])", t)
    if m:
        head_bold = hb
        flush(int(m.group(1)), t[:m.start()])
        flush(page_ref, t[m.end():])
        return
    mm = re.search(r"[\u4e00-\u9fff（]", t)
    pre, zh = (t[:mm.start()], t[mm.start():]) if mm else (t, "")
    ipas = re.findall(r"/[^/]+/", pre)
    ipa = ipas[0] if ipas else ""
    pre = re.sub(r"\s*/[^/]+/\s*", " ", pre).strip()
    pm = re.search(r"\s((?:(?:n|v|adj|adv|pron|prep|conj|interj|num|art|modal v|aux v)\.(?:\s*&\s*)?\s*)+)$", " " + pre)
    posstr = pm.group(1).strip() if pm else ""
    head = (" " + pre)[: pm.start()].strip() if pm else pre
    zh = zh.strip()
    if head.startswith("goose"): head = "goose"
    pos = re.findall(r"(n|v|adj|adv|pron|prep|conj|interj|num|art)\.", posstr + " " + zh)
    cur["words"].append({"w": head, "ipa": ipa, "pos": posstr, "zh": zh, "key": bool(hb), "page": page_ref,
                         "proper": not posstr and any(c.isupper() for c in head) and not head.endswith((".", "?", "!"))})
for pi in range(first, last + 1):
    for b in d[pi].get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                tx = s["text"]; sz = round(s["size"], 1); f = s["font"]
                if re.fullmatch(r"\s*((Starter )?Unit \d+)\s*", tx) and ("Bold" in f or "Smbd" in f) and sz >= 13:
                    cur = {"unit": tx.strip(), "words": []}; units.append(cur); continue
                if cur is None or sz < 10 or "仅供" in tx or "注：" in tx or tx.strip() in ("Vocabulary in Each Unit",) or re.fullmatch(r"\s*\d{2,3}\s*", tx): continue
                if f.startswith("ArnoPro") and sz == 12.6 and not buf and tx.strip():
                    head_bold = "Bold" in f or "Smbd" in f  # 七下的粗体叫 ArnoPro-Smbd
                for part in re.split(r"(\s*p\.\d+\s*)", tx):
                    mp = re.fullmatch(r"\s*p\.(\d+)\s*", part)
                    if mp: flush(int(mp.group(1)))
                    elif part: buf.append(part)
json.dump(units, open(out, "w"), ensure_ascii=False, indent=1)
for u in units: print(u["unit"], len(u["words"]), sum(w["key"] for w in u["words"]), sum(w["proper"] for w in u["words"]))
