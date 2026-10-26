'use strict';
// What the Nether has cost, said where the bot decides to go into it or on
// through a fortress (note 2167). Over the six full runs from 2026-10-25
// 06:00Z to 10-26 07:30Z the bots spent about 4.8 bot-hours in the Nether
// and died there 16 times (3.3 an hour) against 41 deaths in 46 bot-hours
// elsewhere (0.9); 9 of the 16 came in a fortress with wither skeletons or
// blazes about, 10 within 26 minutes of entering (the median 18). Three
// wither skeletons at arm's length took full-1 (07:21:56Z) from 17 to 1
// health in six seconds, shield_guard chosen; a wither skeleton's blow is 8
// (4.5 through iron) and leaves a wither that takes one health every two
// seconds for ten. None of the fortress questions said any of it.
const FLEET = Object.freeze({ from: '2026-10-25 06:00Z', to: '2026-10-26 07:30Z', netherHours: 4.8, netherDeaths: 16, elsewhereHours: 46, elsewhereDeaths: 41, swarm: 9, within26: 10, medianMinutes: 18 });
const perHour = (d, h) => Math.round(d / h * 10) / 10;

// This run's last deaths in the Nether and the mobs about at them (the survival ledger keeps the last ten).
function runSays(goal) {
  const deaths = goal?.survival?.deaths || [];
  if (!deaths.length) return '';
  const nether = deaths.filter(d => d.dimension === 'the_nether');
  if (!nether.length) return ` Of this run's last ${deaths.length} death${deaths.length === 1 ? '' : 's'}, none was in the Nether.`;
  const about = {};
  for (const d of nether) for (const a of d.about || []) if (a?.name) about[a.name] = (about[a.name] || 0) + 1;
  const mobs = Object.entries(about).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, k]) => `${n.replaceAll('_', ' ')} ${k}`).join(', ');
  const causes = [...new Set(nether.map(d => String(d.cause || '').replace(/^Jev /, '').replace(/^was /, '')))].slice(0, 3).join('; ');
  return ` Of this run's last ${deaths.length} death${deaths.length === 1 ? '' : 's'}, ${nether.length} ${nether.length === 1 ? 'was' : 'were'} in the Nether (${causes}${mobs ? `; the mobs about at them: ${mobs}` : ''}).`;
}

// The record in one paragraph, for the questions that take the bot into the Nether or through a fortress.
function says(goal) {
  const F = FLEET;
  return `The Nether's record on the six full runs (${F.from} to ${F.to}): ${F.netherDeaths} deaths in about ${F.netherHours} bot-hours there, ${perHour(F.netherDeaths, F.netherHours)} an hour, against ${F.elsewhereDeaths} in ${F.elsewhereHours} bot-hours elsewhere (${perHour(F.elsewhereDeaths, F.elsewhereHours)}); ${F.swarm} of the ${F.netherDeaths} came in a fortress with wither skeletons or blazes about, ${F.within26} within 26 minutes of entering (the median ${F.medianMinutes}). Three wither skeletons at arm's length took a bot in full iron from 17 to 1 health in six seconds with the shield up; a wither skeleton's blow is 8 (4.5 through iron) and leaves a wither of one health every two seconds for ten.${runSays(goal)}`;
}

// Each stay in the Nether this run (note 2245): when it began and ended, how it ended, and the food points, rods and
// pearls carried in and out, kept on the goal and said on the questions that spend Nether time (pearl_order, the rod
// hunt). The fleet's pearls came at about 0.9 a Nether bot-hour (04:00 to 14:15Z on 2026-10-26) and the fresh runs spent
// 14 to 32% of their hours there; what ended a stay was food and deaths, re-kit and return_to_surface 166 minutes and
// search_food 132 (Fable, 14:30Z and 17:30Z), and no question said how long a stay had lasted or what ended the last ones.
const KEEP = 8;
function carriedNow(bot) {
  const items = bot?.inventory?.items?.() || [];
  const n = name => items.filter(i => i.name === name).reduce((a, i) => a + i.count, 0);
  let food = 0; try { food = require('./healing').foodCarried(bot).reduce((a, f) => a + f.count * f.points, 0); } catch (_) { food = 0; }
  return { food: Math.round(food), rods: n('blaze_rod'), pearls: n('ender_pearl'), hunger: bot?.food ?? null };
}
function noteStint(bot, goal, now = Date.now()) {
  if (!goal || !bot?.game) return;
  const inN = /nether/.test(String(bot.game.dimension || ''));
  const S = goal.netherStints ||= [];
  const open = S.length && !S[S.length - 1].out ? S[S.length - 1] : null;
  if (inN) {
    const c = carriedNow(bot);
    if (!open) S.push({ in: now, seen: now, at: c, now: c });
    else { open.seen = now; open.now = c; }
  } else if (open) {
    open.out = open.seen;
    const deaths = goal?.survival?.deaths || [];
    open.how = deaths.some(d => /nether/.test(String(d.dimension || '')) && Date.parse(d.at) >= open.in - 1000) ? 'died there' : 'came out alive';
    goal.netherStints = S.slice(-KEEP);
  }
}
const mins = ms => Math.max(0, Math.round(ms / 60000));
function stintsSays(bot, goal, now = Date.now()) {
  const S = goal?.netherStints || [];
  if (!S.length) return '';
  const open = !S[S.length - 1].out ? S[S.length - 1] : null;
  const done = S.filter(x => x.out).slice(-4);
  const gain = x => { const r = (x.now?.rods ?? 0) - (x.at?.rods ?? 0), p = (x.now?.pearls ?? 0) - (x.at?.pearls ?? 0); return `${r >= 0 ? '+' : ''}${r} rods, ${p >= 0 ? '+' : ''}${p} pearls`; };
  const here = open ? `This stay in the Nether: ${mins(now - open.in)} minutes so far, come in with ${open.at?.food ?? '?'} food points carried, ${open.at?.rods ?? 0} rods and ${open.at?.pearls ?? 0} pearls; now ${open.now?.food ?? '?'} food points, ${gain(open)} on the stay, hunger ${open.now?.hunger ?? '?'}.` : '';
  const past = done.length ? ` This run's last ${done.length} stay${done.length === 1 ? '' : 's'} before: ${done.map(x => `${mins(x.out - x.in)} minutes, ${x.how}, ${x.at?.food ?? '?'} food points carried in, ${gain(x)}`).join('; ')}.` : '';
  return `${here}${past}`.trim();
}

module.exports = { FLEET, says, runSays, noteStint, stintsSays };
