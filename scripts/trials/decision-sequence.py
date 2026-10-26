# Decision sequence from flight lines on stdin (note 2171):
#   grep -h '"kind":"decision"' .bot-state/flight/127_0_0_1-25594-Jev-*.jsonl | grep '"askedAt":"2026-10-26T05:4' | python3 scripts/trials/decision-sequence.py
import sys,json
rows=[]
for l in sys.stdin:
  try: o=json.loads(l)
  except: continue
  s=o['snapshot']; d=s['decision']; j=(d.get('judgments') or [{}])[0]
  rows.append((d['askedAt'][11:19], round(s['position']['y']), s.get('food'), round(s.get('health') or 0), d['id'], str(j.get('choice')), j.get('confidence')))
rows.sort(key=lambda r: r[0])
last=None
for r in rows:
  if r[4:6]==last: continue
  print(*r); last=r[4:6]
