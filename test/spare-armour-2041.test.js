'use strict';
// full-3 (2026-10-23 04:05Z): its chest put beside the bed slept in held a crafting table; the spare armour of notes 2034
// and 2039 was offered only from ingots carried by the bed, and the iron went on what was worn. A spare piece is a
// strategy option of its own, its iron mined for it (note 2041).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

function bot({ worn = { 6: 'iron_chestplate' }, items = [['iron_pickaxe', 1], ['iron_ingot', 3]] } = {}) {
  const slots = []; for (const [k, n] of Object.entries(worn)) slots[k] = { name: n, count: 1 };
  return { game: { gameMode: 'survival', dimension: 'overworld' }, entity: { position: new Vec3(120.5, 64, 40.5) },
    inventory: { items: () => items.map(([name, count]) => ({ name, count })), slots },
    _survivalState: { spawnBed: { foot: { x: 100, y: 64, z: 40 } }, deaths: [] } };
}

test('a spare iron chestplate for the chest by the bed is offered with its iron, and not once one is spared', () => {
  const { spareArmourOption } = require('../src/strategy');
  const goal = {};
  const o = spareArmourOption(bot(), goal);
  assert.ok(o);
  assert.deepEqual(o.rung, { phase: 'spare_armour', action: 'acquire', item: 'iron_chestplate', count: 1 });
  assert.match(o.description, /^Make a spare iron chestplate \(8 iron ingots, 6 armour points; 3 ingots and 0 raw iron carried, the rest mined and smelted\) and leave it in a chest put beside the bed slept in \(eight planks\), 20 blocks off/);
  goal.bedKit = { position: { x: 99, y: 64, z: 40 }, contents: { iron_chestplate: 1 } };
  assert.equal(spareArmourOption(bot(), goal), null, 'the chest holds one');
  assert.equal(spareArmourOption(bot({ worn: { 6: 'iron_chestplate', 7: 'iron_leggings' } }), goal).rung.item, 'iron_leggings');
  assert.equal(spareArmourOption(bot({ items: [['iron_pickaxe', 1], ['iron_chestplate', 1]] }), {}), null, 'one carried already');
  assert.equal(spareArmourOption(bot({ worn: {} }), {}), null, 'nothing worn: the armour rung is that');
  assert.equal(spareArmourOption(bot({ items: [['stone_pickaxe', 1]] }), {}), null, 'no iron pickaxe');
});
