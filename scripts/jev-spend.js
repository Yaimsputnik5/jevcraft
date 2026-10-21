#!/usr/bin/env node
'use strict';
// What Jev has cost, from the bots' own records (note 2002): every decision
// the flight recorder keeps carries the call's usage, and OpenRouter's says
// the dollars (usage.cost); TypeSafe's calls carry tokens only, counted as
// calls without a cost. By port and by UTC hour, for the window asked.
//   node scripts/jev-spend.js [--since 2026-10-21T00:00Z] [--ports 25591,25592] [--hours]
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const since = Date.parse(opt('--since', '1970-01-01T00:00Z'));
const ports = opt('--ports', null)?.split(',');
// JEV_ROOT reads another checkout's records (from a worktree).
const dir = path.join(process.env.JEV_ROOT || path.join(__dirname, '..'), '.bot-state', 'flight');
const USAGE = /"usage":\{"input_tokens":(\d+),"output_tokens":(\d+)(?:,"cost":([\d.eE+-]+))?/g;
const AT = /"at":"([0-9T:.-]+Z)"/;
const by = {}, hours = {};
for (const f of fs.readdirSync(dir)) {
  const m = f.match(/^127_0_0_1-(\d+)-Jev-.*\.jsonl$/);
  if (!m || (ports && !ports.includes(m[1]))) continue;
  let text;
  try { if (fs.statSync(path.join(dir, f)).mtimeMs < since) continue; text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_) { continue; }
  for (const line of text.split('\n')) {
    if (!line.includes('"usage":{')) continue;
    const at = Date.parse(line.match(AT)?.[1] || '');
    if (!(at >= since)) continue;
    const p = by[m[1]] ||= { calls: 0, priced: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    for (const u of line.matchAll(USAGE)) {
      p.calls++; p.inputTokens += +u[1]; p.outputTokens += +u[2];
      if (u[3] !== undefined) { p.priced++; p.costUsd += +u[3]; const h = new Date(at).toISOString().slice(0, 13); hours[h] = (hours[h] || 0) + +u[3]; }
    }
  }
}
let total = 0;
for (const [port, p] of Object.entries(by).sort()) {
  total += p.costUsd;
  console.log(`${port}: $${p.costUsd.toFixed(2)} over ${p.priced} priced calls (${p.calls - p.priced} without a cost), ${p.inputTokens} in / ${p.outputTokens} out tokens`);
}
console.log(`total: $${total.toFixed(2)}`);
if (args.includes('--hours')) for (const [h, c] of Object.entries(hours).sort()) console.log(`${h}Z $${c.toFixed(2)}`);
