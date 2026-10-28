# 用法: python save_ans.py "<id> 21D 22C ... [!21 理由] ;; <id> ..."
import json,sys,os,re
f='build/ai_answers.json'
A=json.load(open(f)) if os.path.exists(f) else {}
for chunk in sys.argv[1].split(';;'):
    chunk=chunk.strip()
    if not chunk: continue
    pid,rest=chunk.split(' ',1)
    notes=dict(re.findall(r'!(\d+)\s+([^!]+)',rest))
    rest=re.sub(r'!\d+\s+[^!]+','',rest)
    ans={int(m[0]):m[1] for m in re.findall(r'(\d+)([A-G])',rest)}
    A[pid]={'ans':ans,'notes':{int(k):v.strip() for k,v in notes.items()}}
json.dump(A,open(f,'w'),ensure_ascii=False,indent=0)
print(len(A),'篇已作答')
