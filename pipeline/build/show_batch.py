import json,sys,re
d={p['id']:p for p in json.load(open('build/papers_reading.json'))}
ids=json.load(open(sys.argv[3] if len(sys.argv)>3 else 'build/batch1_ids.json'))
a,b=int(sys.argv[1]),int(sys.argv[2])
for i in ids[a:b]:
    p=d[i]; print(f"##### {i} | {p['paper'][:28]}")
    print(re.sub(r'\[图:[^\]]*\]','[图]',' / '.join(p['body'])))
    for q in p['questions']:
        o=' '.join(f"{k}.{v}" for k,v in q['options'].items())
        if q['no']: print(f"Q{q['no']} {q['stem']} || {o}")
        else: print(f"六选五 空{q['blanks']} || {o}")
