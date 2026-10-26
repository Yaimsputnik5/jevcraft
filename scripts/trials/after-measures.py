#!/usr/bin/env python3
# After-measures for the 2026-10-26 notes (2157-2170) over a window (note 2171):
#   python3 scripts/trials/after-measures.py 2026-10-26T07:35 2026-10-26T08:35
# After-measures for the notes of 2026-10-26 (2157-2168), one window:
#   python3 after.py 2026-10-26T07:35 2026-10-26T08:35
# deaths per bot-hour (bare/armoured, by dimension); stance picks by health band with a death within 60 s
# (run_from vs the rest); first-minute pocket picks after a seal; night minutes (wait_in_shelter / night_mine /
# sleep) from time-lost; climbs for food from the climb logs; the new options offered/picked.
import sys, json, glob, subprocess, os
from collections import Counter
from datetime import datetime, timedelta
lo, hi = sys.argv[1], sys.argv[2]
PORTS = [25591, 25593, 25594, 25595, 25596, 25597]
ROOT = '/Users/matt/Code/jevcraft'
T = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
band = lambda h: '0-5' if h <= 5 else '6-10' if h <= 10 else '11-15' if h <= 15 else '16-20'
deaths = Counter(); stance = Counter(); stance_died = Counter(); first = Counter(); later = Counter(); offered = Counter(); picked = Counter(); bed = Counter()
NEW = {'second_bed', 'take_bed_along', 'leave_as_respawn', 'pour_water', 'stay_covered', 'tunnel_home', 'stock_first', 'nether_first', 'end_first', 'wait_it_out', 'night_mine', 'enough_now', 'take_more'}
bot_seconds = 0.0
for p in PORTS:
    sv = json.load(open(f'{ROOT}/.bot-state/127_0_0_1-{p}-Jev-survival.json'))
    dl = [d for d in sv.get('deaths', []) if lo <= d.get('at', '')[:16] <= hi]
    dts = [T(d['at']) for d in dl]
    for d in dl:
        worn = d.get('worn') or []; bare = not any('_' in w and w != 'shield' for w in worn)
        deaths[('bare' if bare else 'armoured', d.get('dimension'))] += 1
    rows = []; last = None; ftimes = []
    for fn in glob.glob(f'{ROOT}/.bot-state/flight/127_0_0_1-{p}-Jev-*.jsonl'):
        for l in open(fn):
            i = l.find('"at":"'); a = l[i + 6:i + 30]
            if not (lo <= a[:16] <= hi): continue
            if '"kind":"decision"' in l:
                try: o = json.loads(l)
                except Exception: continue
                d = o['snapshot']['decision']; j = (d.get('judgments') or [{}])[0]; ch = j.get('choice')
                rows.append((T(d['askedAt']), d['id'], ch, o['snapshot'].get('health'), d))
            else:
                try: ftimes.append(T(a))
                except Exception: pass
    ftimes.sort()
    for k in range(1, len(ftimes)):
        dt = (ftimes[k] - ftimes[k - 1]).total_seconds()
        if 0 < dt < 60: bot_seconds += dt
    rows.sort(key=lambda r: r[0])
    for t, id_, ch, hp, d in rows:
        for k in d['options']:
            if k in NEW: offered[k] += 1
        if ch in NEW: picked[ch] += 1
        if id_ == 'bed_after_sleep': bed[ch] += 1
        if id_ == 'encounter_stance' and ch and ch != 'none_good' and hp is not None:
            dead = any(0 <= (x - t).total_seconds() <= 60 for x in dts)
            k = ('run_from' if ch == 'run_from' else 'other', band(hp)); stance[k] += 1; stance_died[k] += dead
        if id_ == 'pocket_next' and (d.get('state') or {}).get('night') and 'night_mine' in d['options']:
            v = d['options']['night_mine']; txt = v['description'] if isinstance(v, dict) else ''
            (first if txt.startswith('Keeps the seal') or txt.startswith('Undoes the seal') else later)[ch] += 1
bot_h = bot_seconds / 3600
print(f'{lo}..{hi}: {round(bot_h, 1)} bot-hours (frames); deaths {sum(deaths.values())} ({round(sum(deaths.values()) / max(0.1, bot_h), 2)}/bot-h): {dict(deaths)}')
print('stance picks -> deaths within 60 s (run_from vs other) by health band:')
for b in ('0-5', '6-10', '11-15', '16-20'):
    print(f"  {b}: run_from {stance_died[('run_from', b)]}/{stance[('run_from', b)]}  other {stance_died[('other', b)]}/{stance[('other', b)]}")
print('night pocket picks with night_mine offered: first minute', dict(first), ' later', dict(later))
print('bed_after_sleep picks:', dict(bed))
print('new options offered:', dict(offered)); print('new options picked:', dict(picked))
# climbs for food from the climb logs
import re
since_ms = T(lo + ':00+00:00').timestamp() * 1000; until_ms = T(hi + ':00+00:00').timestamp() * 1000
climbs = Counter()
for p in PORTS:
    g = json.load(open(f'{ROOT}/.bot-state/127_0_0_1-{p}-Jev.json'))
    for c in g.get('climbLog') or []:
        if since_ms <= c.get('at', 0) <= until_ms:
            climbs['food' if re.search(r'food|animal|sheep|cow|chicken|pig|rabbit', str(c.get('need', '')), re.I) else 'other'] += 1
print('climbs to open sky:', dict(climbs))
# night minutes from time-lost
try:
    out = subprocess.run(['nice', '-n', '19', 'node', f'{ROOT}/scripts/trials/time-lost.js', *map(str, PORTS), '--since', lo + 'Z', '--json'], capture_output=True, text=True, timeout=600, cwd=ROOT).stdout
    data = json.loads(out); agg = Counter()
    for r in (data if isinstance(data, list) else [data]):
        for k, v in r['doing'].items(): agg[k.split(': ', 1)[-1]] += v / 60000
    keys = ['wait_in_shelter', 'night_mine', 'sleep', 'return_to_surface', 'search_food', 'wait_for_dawn']
    print('time-lost minutes since lo (fleet):', {k: round(agg[k]) for k in keys}, '(note: to now, not hi)')
except Exception as e: print('time-lost failed', e)
