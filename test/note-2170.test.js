'use strict';
// Note 2170: the way down to a dropped item is Jev's, said with what stands at the drop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const db = require('../src/drop-below');

test('the facts of a rod six blocks below among wither skeletons: the drop, the mobs at it, the fall and the item\'s life', () => {
  const entities = { 1: { id: 1, name: 'wither_skeleton', type: 'hostile', position: new Vec3(0.5, 58, 2.5), isValid: true, metadata: [] }, 2: { id: 2, name: 'wither_skeleton', type: 'hostile', position: new Vec3(3.5, 58, 0.5), isValid: true, metadata: [] }, 3: { id: 3, name: 'blaze', type: 'hostile', position: new Vec3(20, 66, 0), isValid: true, metadata: [] } };
  const bot = { entity: { position: new Vec3(0.5, 64, 0.5) }, entities, health: 20, food: 20, game: { dimension: 'the_nether' },
    blockAt: p => { const f = p.floored(); const name = f.y <= 57 ? 'nether_bricks' : 'air'; return { name, boundingBox: name === 'air' ? 'empty' : 'block', position: f }; },
    inventory: { items: () => [], slots: [] }, registry: require('minecraft-data')('26.1') };
  const f = db.facts(bot, new Vec3(0.5, 58, 0.5), { item: 'blaze_rod', worth: 'Blaze rods: 2 carried, 7 wanted in all.' });
  assert.equal(f.drop, 6);
  assert.equal(f.into, 'ground');
  assert.equal(f.damage, 3);
  assert.equal(f.mobs.length, 2, `mobs at the drop: ${JSON.stringify(f.mobs)}`);
  assert.match(f.says, /^The blaze rod lies 6 blocks below, at \(0, 58, 0\), 2 mobs within 8 blocks of it: 2 wither skeletons/);
  assert.match(f.says, /a straight fall of 6 onto the ground costs about 3 health\. A dropped item lies about 5 minutes where it fell, then vanishes\. Blaze rods: 2 carried, 7 wanted in all\.$/);
});

test('the drop_below question is defined with the two ways', () => {
  const { question } = require('../src/decisions');
  const q = question('drop_below');
  assert.deepEqual(q.options.map(o => o.key), ['go_down_for_it', 'leave_it']);
  assert.equal(q.parent, 'hunt_target');
});
