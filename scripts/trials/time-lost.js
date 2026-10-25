'use strict';
// Where a run's time went, from its flight records: each second of play put
// in one bucket (the user, 2026-10-25: "do the time-lost breakdown"; deaths
// were being traced, getting stuck and slow work were not measured).
//
//   node scripts/trials/time-lost.js 25595 25596 25597 [--since 2026-10-24T19:40Z] [--json]
//
// Buckets, the first that holds:
//   waiting  a night or a pocket waited out, a dawn waited for, asleep
//   stuck    the body within 3 blocks of where it was 90 seconds before, at
//            neither waiting nor work that stands still (smelting, crafting,
//            eating, a stance held), or on a step that is a detour or a
//            work-free from a stall
//   travel   walks, climbs, crossings, searches for a place
//   fight    the encounter's stances, a hunt, the body's ways
//   work     mining, tunnelling, smelting, crafting, gathering
//   other    the rest (between steps, offline gaps under a minute)
// Gaps of more than 60 s between frames (the bot down) are not counted.
// Across the buckets, the time after each death until the kit worn and held
// is back to what it was before it (armour pieces worn, best pickaxe, best
// sword) is counted apart as the deaths' cost, with what it went on; a kit
// never got back runs on to the end and is said so.
const fs = require('fs'), path = require('path');
const ROOT = process.env.JEVCRAFT_ROOT || path.join(__dirname, '..', '..');
const FLIGHT = path.join(ROOT, '.bot-state', 'flight');

const args = process.argv.slice(2);
const json = args.includes('--json');
const sinceArg = (() => { const i = args.indexOf('--since'); return i >= 0 ? Date.parse(args[i + 1]) : null; })();
const ports = args.filter(a => /^\d{5}$/.test(a)).map(Number);

const { bucketOf, STUCK_BLOCKS, STUCK_MS } = require('../../src/time-buckets');

const PICK = ['wooden_pickaxe', 'stone_pickaxe', 'golden_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'];
const SWORD = ['wooden_sword', 'stone_sword', 'golden_sword', 'iron_sword', 'diamond_sword', 'netherite_sword'];
function kitScore(snap) {
  const eq = snap.equipment || {}, inv = snap.inventory || {};
  const worn = ['head', 'torso', 'legs', 'feet'].filter(k => eq[k]).length;
  const best = list => Math.max(-1, ...list.map((n, i) => (inv[n] ? i : -1)));
  return { worn, pick: best(PICK), sword: best(SWORD) };
}
const kitBack = (now, then) => now.worn >= then.worn && now.pick >= then.pick && now.sword >= then.sword;

function doingOf(snap, t) {
  const sa = snap.survivalAction;
  if (sa?.action && sa.at && t - Date.parse(sa.at) < 20000) return String(sa.action);
  if (snap.step?.action === 'detour' && snap.step.choice) return `detour:${snap.step.choice}`;
  return snap.step?.action ? String(snap.step.action) : 'between_steps';
}

function analyse(port) {
  const files = fs.readdirSync(FLIGHT).filter(f => f.startsWith(`127_0_0_1-${port}-Jev-`) && f.endsWith('.jsonl')).sort();
  let since = sinceArg;
  if (!since) {
    try { const g = JSON.parse(fs.readFileSync(path.join(ROOT, '.bot-state', `127_0_0_1-${port}-Jev.json`), 'utf8')); since = g.gameProgress?.startedAt || Date.parse(g.createdAt); } catch (_) { since = 0; }
  }
  const out = { port, minutes: {}, deaths: 0, stuckSpots: {}, doing: {}, totalMin: 0, rekit: {}, rekitOpen: false };
  const add = (b, ms, doing) => { out.minutes[b] = (out.minutes[b] || 0) + ms; const k = `${b}: ${doing}`; out.doing[k] = (out.doing[k] || 0) + ms; };
  let prev = null, trail = [], kitBefore = null, rekitSince = null, lastKit = null;
  for (const f of files) {
    const stamp = Date.parse(f.slice(`127_0_0_1-${port}-Jev-`.length, -'.jsonl'.length).replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z'));
    if (Number.isFinite(stamp) && stamp < since - 6 * 3600e3) continue;
    const text = fs.readFileSync(path.join(FLIGHT, f), 'utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      const kind = line.slice(9, 30);
      const isObs = kind.startsWith('observation'), isDec = kind.startsWith('decision'), isConn = kind.startsWith('connection');
      if (!isObs && !isDec && !isConn) continue;
      let d; try { d = JSON.parse(line); } catch (_) { continue; }
      const t = Date.parse(d.at);
      if (!Number.isFinite(t) || t < since) continue;
      const s = d.snapshot || {};
      if (isDec && s.equipment) { lastKit = kitScore(s); if (rekitSince && kitBefore && kitBack(lastKit, kitBefore)) { rekitSince = null; kitBefore = null; } }
      if (isConn && s.health === 0 && /Respawning after death/.test(line)) {
        out.deaths++;
        if (!rekitSince) { kitBefore = lastKit; rekitSince = t; }
        continue;
      }
      if (!isObs || !s.position) continue;
      if (prev) {
        const gap = t - prev.t;
        if (gap > 0 && gap <= 60000) {
          const back = trail.find(p => prev.t - p.t >= STUCK_MS && prev.t - p.t < STUCK_MS + 30000);
          const moved = back ? Math.hypot(prev.pos.x - back.pos.x, prev.pos.y - back.pos.y, prev.pos.z - back.pos.z) : Infinity;
          const stuck = moved < STUCK_BLOCKS;
          const b = bucketOf(prev.doing, stuck);
          add(b, gap, prev.doing);
          if (rekitSince && kitBefore) out.rekit[b] = (out.rekit[b] || 0) + gap;
          if (b === 'stuck') { const k = `${prev.dim} ${Math.round(prev.pos.x)},${Math.round(prev.pos.y)},${Math.round(prev.pos.z)}`.replace(/(\S+) (-?\d+),(-?\d+),(-?\d+)/, (m, dm, x, y, z) => `${dm} ${Math.round(x / 8) * 8},${y},${Math.round(z / 8) * 8}`); out.stuckSpots[k] = (out.stuckSpots[k] || 0) + gap; }
        }
      }
      prev = { t, pos: s.position, doing: doingOf(s, t), dim: String(s.dimension || '').replace('the_', '') };
      trail.push({ t, pos: s.position });
      while (trail.length && t - trail[0].t > 125000) trail.shift();
    }
  }
  out.totalMin = Object.values(out.minutes).reduce((a, b) => a + b, 0) / 60000;
  out.rekitOpen = !!(rekitSince && kitBefore);
  return out;
}

const r1 = n => Math.round(n * 10) / 10;
const results = ports.map(analyse);
if (json) { console.log(JSON.stringify(results.map(r => ({ ...r, minutes: Object.fromEntries(Object.entries(r.minutes).map(([k, v]) => [k, r1(v / 60000)])) })), null, 2)); process.exit(0); }
for (const r of results) {
  const order = ['stuck', 'waiting', 'travel', 'fight', 'work', 'other'];
  console.log(`${r.port}: ${Math.round(r.totalMin)} min counted, ${r.deaths} deaths`);
  console.log('  ' + order.filter(b => r.minutes[b]).map(b => `${b} ${Math.round(r.minutes[b] / 60000)} (${Math.round(100 * r.minutes[b] / 60000 / r.totalMin)}%)`).join(', '));
  const rk = Object.values(r.rekit).reduce((a, b) => a + b, 0) / 60000;
  if (rk) console.log(`  after deaths, before the kit was back: ${Math.round(rk)} min (${Math.round(100 * rk / r.totalMin)}%)${r.rekitOpen ? ', the kit not back yet' : ''}: ` + order.filter(b => r.rekit[b]).map(b => `${b} ${Math.round(r.rekit[b] / 60000)}`).join(', '));
  const spots = Object.entries(r.stuckSpots).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, v]) => v >= 120000);
  if (spots.length) console.log('  stuck most at: ' + spots.map(([k, v]) => `${k} ${Math.round(v / 60000)} min`).join('; '));
  for (const b of ['stuck', 'travel', 'work', 'other']) {
    const top = Object.entries(r.doing).filter(([k]) => k.startsWith(`${b}: `)).sort((a, x) => x[1] - a[1]).slice(0, 4);
    if (top.length) console.log(`  ${b}: ` + top.map(([k, v]) => `${k.slice(b.length + 2)} ${Math.round(v / 60000)}`).join(', '));
  }
}
