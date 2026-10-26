#!/usr/bin/env python3
# Stance picks that stood past twice their stated seconds, from fresh survivalAction frames (note 2169/2171):
#   python3 scripts/trials/stance-held-too-long.py 2026-10-25T06:00 2026-10-26T08:00
# Stance picks whose stand (frames with survivalAction == the stance, contiguous within 20 s) ran past twice the
# seconds the option stated (Fable 07:20Z, #5):  python3 held-too-long.py <from> <to>
import sys, json, glob, bisect
from collections import Counter, defaultdict
from datetime import datetime
lo, hi = sys.argv[1], sys.argv[2]
T = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
picks_n = Counter(); over = Counter(); over_min = Counter(); stand_min = Counter()
for p in (25591, 25593, 25594, 25595, 25596, 25597):
    frames = []; picks = []
    for fn in glob.glob(f'/Users/matt/Code/jevcraft/.bot-state/flight/127_0_0_1-{p}-Jev-*.jsonl'):
        for l in open(fn):
            i = l.find('"at":"'); a = l[i + 6:i + 30]
            if not (lo <= a[:16] <= hi): continue
            if '"kind":"decision"' in l:
                if '"id":"encounter_stance"' not in l: continue
                o = json.loads(l); d = o['snapshot']['decision']; j = (d.get('judgments') or [{}])[0]; ch = j.get('choice')
                v = d['options'].get(ch) if ch else None; ex = (v or {}).get('expects') if isinstance(v, dict) else None
                if ch and ex and ex.get('seconds'): picks.append((T(d['askedAt']), ch, float(ex['seconds'])))
            else:
                try: o = json.loads(l)
                except Exception: continue
                sv = o['snapshot'].get('survivalAction') or {}
                sa = sv.get('action')
                # Fresh only (time-lost's rule): the action noted within 20 s of the frame.
                try:
                    if sa and sv.get('at') and (T(o['at']) - T(sv['at'])).total_seconds() > 20: sa = None
                except Exception: sa = None
                frames.append((T(o['at']), sa))
    frames.sort(key=lambda f: f[0]); ts = [f[0] for f in frames]
    for t, ch, secs in picks:
        k = bisect.bisect_left(ts, t); end = t; last = t
        while k < len(frames):
            ft, sa = frames[k]
            if (ft - last).total_seconds() > 20: break
            if sa == ch: end = ft
            elif sa is not None and (ft - end).total_seconds() > 20: break
            last = ft; k += 1
        stood = (end - t).total_seconds()
        picks_n[ch] += 1; stand_min[ch] += stood / 60
        if stood > 2 * max(secs, 5): over[ch] += 1; over_min[ch] += (stood - secs) / 60
print(f'{lo}..{hi}: stance picks with a stated time, by stance: picks, stood past twice the stated (count, minutes beyond)')
for ch, n in picks_n.most_common(14): print(f'  {ch:18} {n:>4} picks  stood {round(stand_min[ch]):>4} min  over 2x: {over[ch]:>3} ({round(over_min[ch])} min beyond)')
