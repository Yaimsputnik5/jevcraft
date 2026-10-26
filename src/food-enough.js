'use strict';
// Enough food, or more while the animals are here: Jev's question at the
// end of a surface food errand (note 2135). The survival layer's errand ended
// by the code's own floor (food-reserve.js, 12 points in the Overworld: a
// cow and a half), and the bot went back down to its work with that, to
// climb again when it was eaten: full-5 (2026-10-26 01:05 to 03:05Z) made 8
// climbs to open sky for food animals in two hours, about 94 minutes of
// climbing said for them; full-1's return to the surface was 8.2 hours of
// its clock, full-3's 7.3. The user: a death counts only by the time it
// costs; give Jev the option and the facts, not a threshold.
//
// Asked once an errand, with animals in view: stop with what is carried (the
// floor met, how long it lasts at the record's drain, the climbs lately), or
// take the animals in view first (what each gives cooked, the errand's new
// mark). The mark chosen holds fifteen minutes or until it is carried.
const { MEAT_POINTS } = require('./healing');

const KEEP_MS = 15 * 60000;
const MAX_POINTS = 64;
const PREY_RADIUS = 32;
const words = s => String(s).replaceAll('_', ' ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// The food animals in view within PREY_RADIUS, nearest first, each with the
// cooked points its meat gives (healing.js MEAT_POINTS).
function preyInView(bot, radius = PREY_RADIUS) {
  const here = bot?.entity?.position;
  if (!here) return [];
  let preyFood; try { ({ preyFood } = require('./foraging')); } catch (_) { return []; }
  return Object.values(bot.entities || {})
    .filter(e => e?.position && e.isValid !== false && e.position.distanceTo(here) <= radius && preyFood(bot, e))
    .map(e => ({ entity: e, name: e.name, distance: Math.round(e.position.distanceTo(here)), points: MEAT_POINTS[e.name] || 4 }))
    .sort((a, b) => a.distance - b.distance);
}

// The mark Jev chose, while it stands: not yet carried and not fifteen
// minutes old. -> { points, until } or null
function keepTo(state, supply, now = Date.now()) {
  const k = state?.foodKeepTo;
  if (!k || !Number.isFinite(k.points) || k.until <= now || supply >= k.points) return null;
  return k;
}
// Whether the question was asked within the last fifteen minutes (the
// answer, enough or more, holds that long).
const askedLately = (state, now = Date.now()) => !!state?.foodKeepTo && state.foodKeepTo.until > now;

// The two ways, or null with no animal in view or nothing more to take.
// -> { enough_now, take_more, target, prey }
function ways(bot, state, goal, { supply, floor, now = Date.now() } = {}) {
  const prey = preyInView(bot);
  if (!prey.length) return null;
  const take = prey.slice(0, 3);
  const target = Math.min(MAX_POINTS, supply + take.reduce((n, p) => n + p.points, 0));
  if (target <= supply) return null;
  let drain = null; try { drain = require('./food-plan').drain(bot, supply); } catch (_) { drain = null; }
  const lasts = drain?.rate ? Math.round(supply / drain.rate * 60) : null;
  const moreLasts = drain?.rate ? Math.round(target / drain.rate * 60) : null;
  let climbs = ''; try { climbs = require('./work').climbsLatelySays(goal) || ''; } catch (_) { climbs = ''; }
  let record = ''; try { record = require('./food-errand').recordSays(state, now); } catch (_) { record = ''; }
  const hunts = take.map(p => `a ${words(p.name)} ${p.distance} blocks off (${p.points} food points cooked)`).join(', ');
  const common = `${climbs ? ` ${climbs}` : ''}${record ? ` ${record}` : ''}`;
  return {
    target, prey: take,
    enough_now: { description: `Stop the food here with the ${plural(supply, 'food point')} carried (the floor kept here is ${floor}, met) and go back to the work${lasts !== null ? `: at the record's ${drain.rate} hunger an hour of play they last about ${plural(lasts, 'minute')} of play, and the next food is a climb back up from wherever the work is then` : ''}.${common}` },
    take_more: { description: `Take the ${plural(take.length, 'animal')} in view first: ${hunts}. The errand goes on to ${target} food points${moreLasts !== null ? ` (about ${plural(moreLasts, 'minute')} of play at the record's drain)` : ''}, then this is not asked again for it; the mark holds ${Math.round(KEEP_MS / 60000)} minutes or until it is carried.${common}` },
  };
}

module.exports = { preyInView, keepTo, askedLately, ways, KEEP_MS, MAX_POINTS, PREY_RADIUS };
