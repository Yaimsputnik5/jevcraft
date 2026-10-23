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

// full-3 (2026-10-23): in iron at 06:55Z, then bare at 07:29, 07:44 and 08:05Z (note 2043).
test('the spare says what followed each death in armour: the bare deaths before armour again', () => {
  const { bareChainSays, spareArmourOption } = require('../src/strategy');
  const iron = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'golden_boots', 'shield'];
  const b = bot();
  b._survivalState.deaths = [
    { at: '2026-10-23T04:54:05Z', worn: iron }, { at: '2026-10-23T06:55:28Z', worn: iron },
    { at: '2026-10-23T07:29:15Z', worn: [] }, { at: '2026-10-23T07:44:24Z', worn: ['shield'] }, { at: '2026-10-23T08:05:57Z', worn: [] },
  ];
  assert.equal(bareChainSays(b), " After this run's 2 deaths in armour (of its last 5), 3 deaths came in no armour before any in armour again; the most, 3 in 70 minutes after the one at 06:55Z, each back for iron with nothing on.");
  assert.match(spareArmourOption(b, {}).description, /3 in 70 minutes after the one at 06:55Z/);
  b._survivalState.deaths = [{ at: '2026-10-23T04:54:05Z', worn: iron }, { at: '2026-10-23T06:55:28Z', worn: iron }];
  assert.equal(bareChainSays(b), '', 'no bare death after one in armour: nothing said');
});
