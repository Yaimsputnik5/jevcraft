#!/usr/bin/env python3
# Night pocket_next picks in the minute after a seal, with night_mine offered (note 2157/2171):
#   python3 scripts/trials/pocket-first-minute.py 2026-10-26T06:10 2026-10-26T07:00
# Night pocket_next picks in the minute after a seal (the 'Undoes/Keeps the seal' window), by choice; and the stay's hold: minutes to the next pocket_next or any non-pocket decision.
#   python3 pocket-first.py <from> <to>
import sys,json,glob
from collections import Counter
from datetime import datetime
lo,hi=sys.argv[1],sys.argv[2]
T=lambda s: datetime.fromisoformat(s.replace('Z','+00:00'))
first=Counter(); later=Counter(); holds=[]
for p in (25591,25593,25594,25595,25596,25597):
    rows=[]
    for fn in glob.glob(f'/Users/matt/Code/jevcraft/.bot-state/flight/127_0_0_1-{p}-Jev-*.jsonl'):
        for l in open(fn):
            if '"kind":"decision"' not in l: continue
            i=l.find('"askedAt":"'); at=l[i+11:i+27]
            if not (lo<=at<=hi): continue
            o=json.loads(l); d=o['snapshot']['decision']; j=(d.get('judgments') or [{}])[0]
            rows.append((T(d['askedAt']), d['id'], j.get('choice'), d))
    rows.sort(key=lambda r:r[0])
    for k,(t,id_,ch,d) in enumerate(rows):
        if id_!='pocket_next' or not (d.get('state') or {}).get('night') or 'night_mine' not in d['options']: continue
        txt=d['options']['night_mine']['description'] if isinstance(d['options']['night_mine'],dict) else ''
        win = txt.startswith('Undoes the seal') or txt.startswith('Keeps the seal')
        (first if win else later)[ch]+=1
        if win and ch=='stay':
            nxt=[r for r in rows[k+1:] if r[1]!='turn_priority' and r[1]!='encounter_stance']
            if nxt: holds.append(round((nxt[0][0]-t).total_seconds()/60,1))
print(f'{lo}..{hi} night pocket_next with night_mine offered')
print(' first minute after a seal:', dict(first.most_common()))
print(' later:', dict(later.most_common()))
print(' first-minute stay -> next question (min):', sorted(holds))
