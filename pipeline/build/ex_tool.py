"""写解析用的小工具（只在整理数据时用）。
  python ex_tool.py show 起 止      打印第 起~止 篇（文章、题目、答案）
  python ex_tool.py save < 解析.json  合并进 explanations.json，并检查原文依据能不能在正文里逐字找到
"""
import json, re, sys
R = json.load(open('../../../web/public/data/reading.json'))['articles']
D = {a['id']: a for a in R}
done = json.load(open('explanations.json'))
order = [a['id'] for a in R if a['id'] not in json.load(open('explain_sample_ids.json'))]
if sys.argv[1] == 'show':
    a0, a1 = int(sys.argv[2]), int(sys.argv[3])
    for i in order[a0:a1]:
        a = D[i]
        print(f'##### {i} | {a["src"]}')
        print(' / '.join(re.sub(r'\[图:[^\]]*\]', '[图]', l) for l in a['body']))
        for q in a['qs']:
            o = ' '.join(f'{k}.{re.sub(r"\[图:[^\]]*\]", "[图]", v)}' for k, v in q['opts'])
            if q.get('six'):
                print(f'六选五 {o} => {q["ans"]}')
            else:
                print(f'Q{q["n"]} {q["stem"]} || {o} => {q["ans"]}')
    print(f'-- 共 {len(order)} 篇，已写 {sum(1 for i in order if i in done)} 篇')
else:
    new = json.load(sys.stdin)
    bad = []
    for aid, qs in new.items():
        text = '\n'.join(D[aid]['body'])
        for k, e in qs.items():
            if e.get('ev') and e['ev'] not in text:
                bad.append(f'{aid} {k}: {e["ev"][:50]}')
        done[aid] = qs
    json.dump(done, open('explanations.json', 'w'), ensure_ascii=False, indent=1)
    print('已写', sum(1 for i in order if i in done), '/', len(order), '篇')
    print('找不到的原文依据：', bad if bad else '无')
