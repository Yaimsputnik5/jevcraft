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
