'use strict';
// full-3 (2026-10-24 00:57Z) carried the makings of a bed and set the bed aside at its rung's question (note 2059).
const test = require('node:test');
const assert = require('node:assert/strict');

function bot(items) { return { registry: require('minecraft-data')('26.1'), inventory: { items: () => items.map(([name, count]) => ({ name, count })) } }; }

test('a bed the pockets make with crafts alone is found, mixed wool dyed white with the bones carried', () => {
  const { bedFromPockets } = require('../src/work');
  const mixed = bedFromPockets(bot([['white_wool', 2], ['gray_wool', 1], ['black_wool', 1], ['bone', 4], ['oak_planks', 3], ['crafting_table', 1]]));
  assert.equal(mixed?.item, 'white_bed');
  assert.match(mixed.from, /2 white wool, 1 gray wool, 1 black wool, 1 dyed white/);
  assert.equal(bedFromPockets(bot([['red_wool', 3], ['oak_planks', 3], ['crafting_table', 1]]))?.item, 'red_bed');
  assert.equal(bedFromPockets(bot([['white_wool', 2], ['oak_planks', 3]])), null, 'two wool: a gathering step, not crafts alone');
  assert.equal(bedFromPockets(bot([['white_wool', 2], ['gray_wool', 1], ['oak_planks', 3]])), null, 'mixed and no dye');
});

test('string carried makes the wool a bed is short of (note 2061)', () => {
  const { bedFromPockets } = require('../src/work');
  assert.equal(bedFromPockets(bot([['white_wool', 2], ['string', 4], ['oak_planks', 3], ['crafting_table', 1]]))?.item, 'white_bed');
  assert.equal(bedFromPockets(bot([['white_wool', 2], ['string', 3], ['oak_planks', 3]])), null, 'three string: short');
});

test('wool for the nights ahead is offered with sheep in view and fewer than nine carried (note 2061)', () => {
  const { woolStockOption } = require('../src/strategy');
  const { Vec3 } = require('vec3');
  const b = { game: { gameMode: 'survival', dimension: 'overworld' }, entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [{ name: 'white_wool', count: 2 }, { name: 'string', count: 4 }] },
    entities: { 1: { name: 'sheep', isValid: true, position: new Vec3(12, 64, 0) } } };
  const o = woolStockOption(b, { gameProgress: { clock: { playedMs: 3.6e6 * 10, byDoing: { wait_in_shelter: 3.6e6 * 2 } } } });
  assert.ok(o);
  assert.deepEqual(o.rung, { phase: 'wool_stock', action: 'gather_wool', count: 6 });
  assert.match(o.description, /1 in view, the nearest 12 blocks off.*Carried now: 2 wool, 4 string \(four a wool\)\. Each night slept in a bed left behind as the respawn point takes a bed of its own.*This run so far: 2 of its 10 hours/);
  b.entities = {};
  assert.equal(woolStockOption(b, {}), null, 'no sheep in view');
});
