'use strict';
// Note 2272: a spare iron set for the store by the bed slept in, a rung of the ladder.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spareArmourOwed, DEFERRABLE } = require('../src/game-progress');

const botWith = ({ worn = {}, pockets = [], bed = { x: 0, y: 64, z: 0 } } = {}) => ({
  _survivalState: { spawnBed: bed ? { foot: bed } : null },
  inventory: { items: () => pockets.map(name => ({ name, count: 1 })), slots: Object.fromEntries(Object.entries(worn).map(([slot, name]) => [slot, { name }])) },
});
const ironWorn = { 5: 'iron_helmet', 6: 'iron_chestplate', 7: 'iron_leggings', 8: 'golden_boots' };

test('the chestplate first, then the leggings, then the helmet; golden boots want no iron spare', () => {
  assert.equal(spareArmourOwed(botWith({ worn: ironWorn }), {}), 'iron_chestplate');
  assert.equal(spareArmourOwed(botWith({ worn: ironWorn, pockets: ['iron_chestplate'] }), {}), 'iron_leggings');
  assert.equal(spareArmourOwed(botWith({ worn: ironWorn }), { bedKit: { contents: { iron_chestplate: 1, iron_leggings: 1 } } }), 'iron_helmet');
  assert.equal(spareArmourOwed(botWith({ worn: ironWorn }), { survival: { home: { stash: { contents: { iron_chestplate: 1, iron_leggings: 1, iron_helmet: 1 } } } } }), null);
});

test('no bed slept in, or nothing iron worn: no spare owed; the rung may wait', () => {
  assert.equal(spareArmourOwed(botWith({ worn: ironWorn, bed: null }), {}), null);
  assert.equal(spareArmourOwed(botWith({ worn: { 8: 'golden_boots' } }), {}), null);
  assert.ok(DEFERRABLE.has('spare_armour'));
});
