'use strict';
// Note 2174: leaving the fortress to come back better kitted, said with the kit worn against the set and the record.
const test = require('node:test');
const assert = require('node:assert/strict');
const LFK = require('../src/leave-for-kit');

const bot = (slots, items) => ({ game: { dimension: 'the_nether' }, entity: { position: { x: 0, y: 64, z: 0 } }, inventory: { slots: Object.assign(Array(46).fill(null), slots), items: () => items } });

test('the kit line counts the pieces short and the ingots to make them', () => {
  const b = bot({ 5: { name: 'iron_helmet' }, 6: { name: 'iron_chestplate' } }, [{ name: 'iron_sword', count: 1 }, { name: 'iron_ingot', count: 3 }, { name: 'cooked_beef', count: 4 }]);
  const k = LFK.kit(b);
  assert.deepEqual(k.missing, ['leggings', 'boots']);
  assert.equal(k.ingotsShort, 8);
  assert.equal(k.points, 8);
  assert.match(LFK.kitSays(b), /^Worn now: iron helmet, iron chestplate \(8 armour points\), short of the iron set by leggings, boots: 11 iron ingots, 3 carried, 8 more to mine and smelt; held: iron sword, no shield; food carried \d+ points\.$/);
  assert.match(LFK.kitSays(bot({}, [])), /^Worn now: nothing \(no armour\), short of the iron set by helmet, chestplate, leggings, boots: 24 iron ingots, 0 carried, 24 more/);
});

test('no option out of the Nether or with no way back; the Overworld fact says the leave', () => {
  assert.equal(LFK.option({ game: { dimension: 'overworld' } }, {}, { returnOverworld: async () => {} }), null);
  assert.equal(LFK.option(bot({}, []), {}, {}), null);
  assert.equal(LFK.cameOutForKitSays({ leaveNether: { reason: 'food', at: Date.now() } }), '');
  assert.match(LFK.cameOutForKitSays({ leaveNether: { reason: 'kit', at: Date.now() - 5 * 60000 } }), /came out of the Nether 5 minutes ago for the rest of the kit, as Jev chose \(leave_for_kit\)/);
});
