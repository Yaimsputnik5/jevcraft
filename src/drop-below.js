'use strict';
// A dropped item lying below the bot (a blaze's rod on the floor under the
// bridge it was killed from): going down after it was a rule (mob-hunt.js
// prepareMobHunt, 'where the walk fails and the drop is below, go down after
// it'), no question asked. full-1 (2026-10-26 07:21:47Z), in full iron at 20
// health on a fortress bridge at y 67, went down six blocks for a blaze rod
// into six wither skeletons and a blaze and was dead at 07:21:56Z, 17 to 1
// health in six seconds. The way down is Jev's (note 2170), said with the
// drop, what stands within eight blocks of it, the fall, the item's worth and
// how long it lies.
const DROP_LIFE_S = 300, NEAR = 8;
const words = s => String(s || '').replaceAll('_', ' ');

// -> { drop, into, damage, mobs: [{name, distance}], says }
function facts(bot, below, { item = 'blaze_rod', worth = '' } = {}) {
  const here = bot.entity.position, drop = Math.round(here.y - below.y);
  let fall = { into: 'ground' }; try { fall = require('./terrain').fallFrom(p => bot.blockAt(new (require('vec3').Vec3)(p.x, p.y, p.z)), { x: Math.floor(here.x), y: Math.floor(here.y) - 1, z: Math.floor(here.z) }, { deepest: drop + 4 }); } catch (_) { fall = { into: 'ground' }; }
  let damage = 0; try { damage = require('./terrain').fallDamage(drop, fall.into); } catch (_) { damage = Math.max(0, drop - 3); }
  let mobs = [];
  try {
    mobs = require('./danger').threats(bot, 48).filter(t => t.entity?.position && t.entity.position.distanceTo(below) <= NEAR)
      .map(t => ({ name: t.entity.name, distance: Math.round(t.entity.position.distanceTo(below) * 10) / 10, visible: !!t.visible })).sort((a, b) => a.distance - b.distance);
  } catch (_) { mobs = []; }
  const kinds = {};
  for (const m of mobs) kinds[m.name] = (kinds[m.name] || 0) + 1;
  const mobSays = mobs.length ? `${mobs.length} mob${mobs.length === 1 ? '' : 's'} within ${NEAR} blocks of it: ${Object.entries(kinds).map(([n, k]) => `${k} ${words(n)}${k === 1 ? '' : 's'}`).join(', ')}${mobs.some(m => !m.visible) ? ' (some out of sight)' : ''}` : `nothing hostile within ${NEAR} blocks of it`;
  const says = `The ${words(item)} lies ${drop} block${drop === 1 ? '' : 's'} below, at (${Math.floor(below.x)}, ${Math.floor(below.y)}, ${Math.floor(below.z)}), ${mobSays}. The way down is dug and dropped a step at a time; a straight fall of ${drop} ${fall.into === 'lava' ? 'ends in lava' : `onto the ground costs about ${damage} health`}. A dropped item lies about ${DROP_LIFE_S / 60} minutes where it fell, then vanishes.${worth ? ` ${worth}` : ''}`;
  return { drop, into: fall.into, damage, mobs, says };
}

module.exports = { facts, DROP_LIFE_S, NEAR };
