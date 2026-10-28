"""课本课文、对话、听力录音的文件名 → 网页里用的编号和标题。"""
import re


def parse(name: str):
    """"Unit 1 Section A, 1b.mp3" → ("unit-1", "unit-1-a-1b", "Section A · 1b", 排序键)"""
    m = re.match(r"^(Starter Unit|Unit) (\d+) (Section [AB]|Pronunciation), (\w+)\.mp3$", name)
    if not m:
        return None
    kind, n, part, code = m.groups()
    unit = f"{'starter-unit' if kind.startswith('Starter') else 'unit'}-{n}"
    if part == "Pronunciation":
        lid, title, order = f"{unit}-pron-{code}", f"Pronunciation · {code}", (1, code)
    else:
        sec = part[-1]
        lid, title, order = f"{unit}-{sec.lower()}-{code}", f"{part} · {code}", (0 if sec == "A" else 2, code)
    return unit, lid, title, order
