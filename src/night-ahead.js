'use strict';
// The coming night, said by day on the strategy question (note 2158): when
// dusk is, how long the night to dawn is, and what it is spent on given what
// is carried. full-6 (2026-10-26 05:13Z), back to life with 16 dirt and 3
// beef, 6 minutes of daylight left, chose the bed rung, searched for sheep
// till dusk, and sat the 11-minute night sealed in with nothing to dig with,
// twice over; it was told the daylight left, not what the night would be.
// Over the 145-hour runs the nights stand at 999 to 1279 minutes sealed
// waiting against 151 to 172 night-mining and 21 to 23 asleep.
const { DAY } = require('./day');

// Dusk to dawn in real minutes (a tick is a twentieth of a second).
const NIGHT_MINUTES = Math.round((DAY.DAWN - DAY.DUSK) / 1200 * 10) / 10;

const count = (items, re) => items.filter(i => re.test(i.name)).reduce((n, i) => n + i.count, 0);
const label = name => String(name).replaceAll('_', ' ');

// Whether the night can be a mine: a pickaxe carried, or one makeable from
// what is carried (a table and a wooden pickaxe take two logs; a stone one
// three cobblestone besides).
function pickaxeSays(items) {
  const pick = items.find(i => /_pickaxe$/.test(i.name));
  if (pick) return `a ${label(pick.name)} is carried`;
  const logs = count(items, /_log$/), planks = count(items, /_planks$/), sticks = count(items, /^stick$/), cobble = count(items, /^(cobblestone|cobbled_deepslate)$/), iron = count(items, /^iron_ingot$/);
  const wood = logs * 4 + planks; // planks' worth
  const table = items.some(i => i.name === 'crafting_table');
  // A table is 4 planks; a pickaxe 3 planks and 2 sticks (1 plank).
  const woodForPick = table ? 4 : 8;
  if (wood + sticks / 2 >= woodForPick || (table && (sticks >= 2 && planks >= 3))) {
    const make = iron >= 3 ? 'an iron pickaxe' : cobble >= 3 ? 'a stone pickaxe' : 'a wooden pickaxe';
    return `no pickaxe is carried, but ${make} can be made from what is carried (${logs ? `${logs} logs` : `${planks} planks`}${sticks ? `, ${sticks} sticks` : ''}${table ? ', a crafting table' : ''}${cobble ? `, ${cobble} cobblestone` : ''}${iron ? `, ${iron} iron ingots` : ''})`;
  }
  return `no pickaxe is carried and none can be made from what is carried (${logs} logs, ${planks} planks${table ? ', a crafting table' : ', no crafting table'}: a table and a wooden pickaxe take two logs' worth of planks)`;
}

// The fact, or null off the Overworld, by night, or with no clock.
function nightAheadSays(bot, goal, now = Date.now()) {
  const t = bot.time?.timeOfDay;
  if (!Number.isFinite(t) || t >= DAY.DUSK) return null;
  if (!/overworld/.test(String(bot.game?.dimension || 'overworld'))) return null;
  const minutes = Math.round((DAY.DUSK - t) / 1200 * 10) / 10;
  const items = bot.inventory?.items?.() || [];
  const bed = items.some(i => /_bed$/.test(i.name));
  const by = goal?.gameProgress?.clock?.byDoing || {};
  const mins = k => Math.round((by[k] || 0) / 60000);
  const run = `This run so far: ${mins('wait_in_shelter')} minutes sealed waiting through nights, ${mins('night_mine')} night-mining, ${mins('sleep')} asleep.`;
  return `Dusk in about ${minutes} real minutes; the night from dusk to dawn is about ${NIGHT_MINUTES} real minutes. How a night is spent: asleep, in seconds, with a bed set down at bedtime (${bed ? 'a bed is carried' : 'no bed is carried'}); or mining from a sealed pocket, which keeps the rock's shelter and gains ore and stone, with a pickaxe (${pickaxeSays(items)}); or sealed in, gaining nothing. ${run}`;
}

// This run's own nights, for the bed questions (note 2180): the minutes sealed waiting, mining and asleep so far,
// and the waiting's share of the run's play. full-3 waited 21.8 hours of its 150 (15%) with a bed standing far off
// and none carried; the bed question had said the fleet's record and nothing of this run's own.
function runNightsSays(goal) {
  const clock = goal?.gameProgress?.clock;
  if (!clock?.byDoing) return '';
  const by = clock.byDoing, mins = k => Math.round((by[k] || 0) / 60000);
  const waited = mins('wait_in_shelter'), played = Math.round((clock.playedMs || 0) / 60000);
  if (!played) return '';
  const share = Math.round(waited / played * 100);
  const hours = n => n >= 90 ? `${Math.round(n / 6) / 10} hours` : `${n} minutes`;
  return ` This run so far: ${hours(waited)} sealed in waiting through nights (${share}% of its ${hours(played)} of play), ${hours(mins('night_mine'))} night-mining, ${hours(mins('sleep'))} asleep; a night with a bed carried and set down at bedtime passes in seconds, one waited out awake is about ${NIGHT_MINUTES} real minutes.`;
}

module.exports = { nightAheadSays, pickaxeSays, runNightsSays, NIGHT_MINUTES };
