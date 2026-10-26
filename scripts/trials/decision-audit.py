#!/usr/bin/env python3
# Decision audit over a window of the flight records (note 2171; the audits that found notes 2127-2169):
#   python3 scripts/trials/decision-audit.py 2026-10-26T04:00 2026-10-26T06:00 [ports...]
# Fleet audit over a time window, from the flight records:
#   python3 audit.py 2026-10-26T04:00 2026-10-26T06:00 [ports...]
# none_good rates by question, night flips (night_mine -> climb within 3 min),
# stillness_detour asks during smelts, crossing_kit take_up_food runs,
# surface_trip climbs at dusk, deaths by armour.
import sys, json, glob
from collections import Counter, defaultdict
from datetime import datetime
lo, hi = sys.argv[1], sys.argv[2]
ports = sys.argv[3:] or ['25591', '25593', '25594', '25595', '25596', '25597']
T = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
asked = Counter(); ng = Counter(); flips = Counter(); mines = Counter(); smelt_asks = 0; smelt_ng = 0
take_runs = []; dusk = 0; strips = 0; deaths = Counter(); offered = Counter(); picked = Counter()
for p in ports:
    rows = []
    for fn in glob.glob(f'/Users/matt/Code/jevcraft/.bot-state/flight/127_0_0_1-{p}-Jev-*.jsonl'):
        for l in open(fn):
            if '"kind":"decision"' not in l: continue
            i = l.find('"askedAt":"')
            at = l[i + 11:i + 27]
            if not (lo <= at <= hi): continue
            try: o = json.loads(l)
            except Exception: continue
            s = o['snapshot']; d = s['decision']; j = (d.get('judgments') or [{}])[0]
            rows.append((d['askedAt'], d['id'], j.get('choice'), d, s))
    rows.sort(key=lambda r: r[0])
    prev_cross = None; run = 0
    for at, id_, ch, d, s in rows:
        asked[id_] += 1
        if ch == 'none_good': ng[id_] += 1
        for k in d['options']:
            if k in ('wait_it_out', 'end_first', 'take_more', 'enough_now', 'nether_first'): offered[k] += 1
        if ch in ('wait_it_out', 'end_first', 'take_more', 'enough_now', 'nether_first'): picked[ch] += 1
        if id_ == 'stillness_detour' and ((s.get('goal') or {}).get('step') or {}).get('action') == 'smelt':
            smelt_asks += 1; smelt_ng += ch == 'none_good'
        if id_ == 'surface_trip':
            strips += 1; dusk += 'It is dusk up there' in json.dumps(d['options'])
        if id_ == 'crossing_kit':
            if ch == 'take_up_food': run += 1
            else:
                if run: take_runs.append(run)
                run = 0
    if run: take_runs.append(run)
    mine_ts = [T(at) for at, id_, ch, d, s in rows if id_ == 'shelter_method' and ch == 'night_mine']
    climb_ts = [T(at) for at, id_, ch, d, s in rows if (id_ == 'surface_trip' and ch == 'climb') or (id_ == 'sheep_search' and ch == 'climb_first') or id_ == 'climb_out']
    mines[p] = len(mine_ts)
    flips[p] = sum(1 for m in mine_ts if any(0 < (c - m).total_seconds() <= 180 for c in climb_ts))
    try:
        sv = json.load(open(f'/Users/matt/Code/jevcraft/.bot-state/127_0_0_1-{p}-Jev-survival.json'))
        for dd in sv.get('deaths') or []:
            if lo <= dd.get('at', '')[:16] <= hi:
                worn = dd.get('worn') or []
                deaths['bare' if not any('_' in w and w != 'shield' for w in worn) else 'armoured'] += 1
    except Exception: pass
# Chosen-but-ineffective (Fable 04:40Z): the same question back within 60 s of a pick.
back = Counter(); picks = Counter()
for p in ports:
    byid = defaultdict(list)
    for fn in glob.glob(f'/Users/matt/Code/jevcraft/.bot-state/flight/127_0_0_1-{p}-Jev-*.jsonl'):
        for l in open(fn):
            if '"kind":"decision"' not in l: continue
            i = l.find('"askedAt":"'); at = l[i + 11:i + 27]
            if not (lo <= at <= hi): continue
            try: o = json.loads(l)
            except Exception: continue
            d = o['snapshot']['decision']; j = (d.get('judgments') or [{}])[0]
            byid[d['id']].append((T(d['askedAt']), j.get('choice')))
    for id_, lst in byid.items():
        if id_ in ('turn_priority', 'encounter_stance', 'shot_answer'): continue
        lst.sort()
        for k, (t, ch) in enumerate(lst):
            if ch in (None, 'none_good'): continue
            picks[(id_, ch)] += 1
            if k + 1 < len(lst) and (lst[k + 1][0] - t).total_seconds() <= 60: back[(id_, ch)] += 1
total = sum(asked.values())
print(f'window {lo} to {hi}: {total} decisions, none_good {sum(ng.values())} ({100 * sum(ng.values()) / max(1, total):.1f}%)')
for k, v in ng.most_common(8): print(f'  {k}: {v} of {asked[k]} ({100 * v / asked[k]:.0f}%)')
print(f'night mines {sum(mines.values())}, left by a climb within 3 min {sum(flips.values())}  {dict(flips)}')
print(f'stillness_detour during smelt: {smelt_asks} asks, {smelt_ng} none_good')
print(f'crossing_kit take_up_food runs: {sorted(take_runs, reverse=True)[:8]}')
print(f'surface_trip asks {strips}, saying dusk {dusk}')
print(f'offered {dict(offered)}; picked {dict(picked)}')
print(f'deaths {dict(deaths)}')
print('same question back within 60 s of a pick (ineffective?):')
for k, v in sorted(back.items(), key=lambda kv: -kv[1])[:10]: print(f'  {v} of {picks[k]} ({100 * v // max(1, picks[k])}%)  {k}')
