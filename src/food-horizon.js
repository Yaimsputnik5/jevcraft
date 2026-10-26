'use strict';
// The hunger the work below will cost against the food carried, said before
// the bot goes down (note 2165): full-1 (2026-10-26 06:32Z) chose to dig
// down 35 blocks for 20 raw iron with nothing to eat, a sheep 42 blocks off
// and three cows at 94 in view, and the food question came back from under
// the rock as a climb; full-4 made five climbs to open sky for food in a day.
// return_to_surface stood at 66 to 129 minutes a run in the last 24 hours of
// the 145-hour runs. The conversion Jev lacked: minutes of work below, the
// drain there, the points carried, the animals in view now and what they
// are worth, this run's climbs for food.
const DRAIN_UNDER = (() => { try { return require('./food-plan').DRAIN.under; } catch (_) { return 23.7; } })();
// Ore an hour where this run has no record of the band yet (ore-depth.js FLEET, the middle of the fresh runs' range).
const FLEET_RATE = { raw_iron: 220 };
const FOOD_CLIMB = /food|animal|sheep|cow|chicken|pig|rabbit/i;

const words = s => String(s || '').replaceAll('_', ' ');
const r1 = x => Math.round(x * 10) / 10;

// This run's ore an hour at the depth's band, or the fleet's. -> { perHour, from }
function rateAt(goal, drop, depth) {
  let band = null; try { band = require('./ore-depth').bandOf(depth); } catch (_) { band = null; }
  const rec = band && goal?.oreByDepth?.[band.key];
  if (rec && rec.ms >= 5 * 60000) return { perHour: Math.max(1, Math.round((rec.found?.[drop] || 0) / (rec.ms / 3600000))), from: `this run's own rate ${band.label}` };
  return { perHour: FLEET_RATE[drop] || 120, from: 'the fresh runs\' rate' };
}

// The climbs to open sky for food this run noted in the last 24 hours (work.js noteClimb). -> { count, seconds }
function foodClimbs(goal, now = Date.now()) {
  const log = (goal?.climbLog || []).filter(c => now - c.at < 24 * 3600000 && FOOD_CLIMB.test(String(c.need || '')));
  return { count: log.length, seconds: log.reduce((n, c) => n + (c.seconds || 0), 0) };
}

// -> { minutes, hunger, carried, prey, seen, target, says } or null without a bot.
function horizon(bot, goal, { drop, wanted = 1, digSecs = 0, climbSecs = 0, depth, now = Date.now() } = {}) {
  if (!bot?.entity?.position) return null;
  const rate = rateAt(goal, drop, depth);
  const mining = wanted / rate.perHour * 60;
  const minutes = r1((digSecs + climbSecs) / 60 + mining);
  const hunger = r1(minutes / 60 * DRAIN_UNDER);
  let carried = 0; try { carried = require('./foraging').foodSupply(bot); } catch (_) { carried = 0; }
  let prey = []; try { prey = require('./food-enough').preyInView(bot); } catch (_) { prey = []; }
  let seen = [];
  try {
    const S = require('./sightings');
    seen = ['cow', 'sheep', 'pig', 'chicken'].flatMap(k => S.sighted(bot, goal, k).filter(s => s.distance > 32 && s.distance <= 128).map(s => ({ kind: k, ...s }))).sort((a, b) => a.distance - b.distance).slice(0, 3);
  } catch (_) { seen = []; }
  const climbs = foodClimbs(goal, now);
  const preyPoints = prey.reduce((n, p) => n + (p.points || 0), 0);
  const target = Math.ceil(carried + hunger);
  const preySays = prey.length ? ` Animals in view now: ${prey.slice(0, 4).map(p => `a ${words(p.name)} ${p.distance} blocks off (${p.points} points cooked)`).join(', ')}${prey.length > 4 ? `, and ${prey.length - 4} more` : ''}: about ${preyPoints} points in all.` : ' No animal is in view now.';
  const seenSays = seen.length ? ` Seen earlier, out of view: ${seen.map(s => s.says).join('; ')}.` : '';
  const climbSays = climbs.count ? ` This run's climbs to open sky for food in the last 24 hours: ${climbs.count}, about ${Math.round(climbs.seconds / 60)} minutes of climbing said for them, each leaving the work below and coming back to it.` : '';
  const says = `The work below is about ${minutes} minutes (${wanted} ${words(drop)} at about ${rate.perHour} an hour there, ${rate.from}, with the dig down and the climb back); hunger drains about ${Math.round(DRAIN_UNDER)} points an hour under the surface, about ${hunger} points over that work. Food carried: ${carried} point${carried === 1 ? '' : 's'}${carried ? '' : ' (nothing to eat)'}; health comes back only at hunger eighteen or more, and food is found at the surface.${preySays}${seenSays}${climbSays}`;
  return { minutes, hunger, carried, prey, seen, target, says, rate };
}

module.exports = { horizon, rateAt, foodClimbs, DRAIN_UNDER, FLEET_RATE };
