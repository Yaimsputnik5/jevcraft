'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

// Note 2117: the drops as the dying client sees them, where each landed and
// what the mobs about hold, kept with the death and searched and said on the
// walk back.
test('the death record keeps the drops seen lying and the mobs holding things', () => {
  const { recordDeath } = require('../src/recovery');
  const item = (name, count, x, y, z) => ({ position: new Vec3(x, y, z), isValid: true, getDroppedItem: () => ({ name, count }) });
  const zombie = { name: 'zombie', type: 'hostile', position: new Vec3(3, 64, 0), isValid: true, equipment: [{ name: 'iron_sword' }, null, null, null, { name: 'iron_helmet' }] };
  const bot = { entity: { id: 1, position: new Vec3(0.5, 64, 0.5) }, game: { dimension: 'overworld' }, food: 10, blockAt: () => ({ name: 'air' }),
    inventory: { items: () => [], slots: {} }, entities: { 7: item('iron_chestplate', 1, 2.5, 64, 0.5), 8: item('cooked_beef', 8, 4.3, 63.5, 1.5), 9: item('dirt', 3, 30, 64, 0), 10: zombie } };
  const state = {};
  recordDeath(bot, state);
  assert.deepEqual(state.recovery.dropsSeen, [{ name: 'iron_chestplate', count: 1, x: 2.5, y: 64, z: 0.5 }, { name: 'cooked_beef', count: 8, x: 4.3, y: 63.5, z: 1.5 }], 'within 24 blocks only');
  assert.deepEqual(state.recovery.mobsHolding, [{ name: 'zombie', distance: 3, holds: ['iron_sword', 'iron_helmet'] }]);
});

test('the walk back says where the stacks were seen and what the mobs held, and searches there', () => {
  const { dropsSeenSays } = require('../src/corpse-run');
  const run = { position: { x: 400, y: 64, z: 0 }, drops: [{ name: 'iron_chestplate', count: 1, x: 402.5, y: 64, z: 0.5 }, { name: 'cooked_beef', count: 8, x: 406.3, y: 59.5, z: 1.5 }], mobsAtDeath: [{ name: 'zombie', distance: 3, holds: ['iron_sword'] }, { name: 'skeleton', distance: 9 }] };
  assert.equal(dropsSeenSays(run), ' As it died the bot saw 2 stacks of its drops lying within 7 blocks of the death cell, from y 59 to 64: iron chestplate at (403, 64, 1), 8 cooked beef at (406, 60, 2); the walk back searches there. Mobs about it then held things: the zombie 3 blocks off iron sword; a zombie or skeleton picks up armour and weapons it walks over and drops them when killed.');
  assert.match(dropsSeenSays({ position: { x: 0, y: 0, z: 0 }, drops: [] }), /saw none of its drops lying/);
  assert.equal(dropsSeenSays({ position: { x: 0, y: 0, z: 0 } }), '', 'an older death with no snapshot says nothing');
});
