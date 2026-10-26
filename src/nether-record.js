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

module.exports = { FLEET, says, runSays };
