'use strict';
// Note 2177: water the walk keeps putting the body back into is counted, said, and kept out of the walks when chosen.
const test = require('node:test');
const assert = require('node:assert/strict');
const WT = require('../src/water-trap');

test('the same water counted across askings, a trap from the second; the keep-out refuses its cells for ten minutes', () => {
  const goal = { step: { action: 'go_to_end_portal', target: { x: 2052, y: 42, z: 1511 } } };
  const feet = { x: 2066.5, y: 51.0, z: 1411.5 };
  assert.equal(WT.here(goal, feet), null);
  WT.note(goal, feet, 1000);
  assert.equal(WT.here(goal, feet, 2000), null, 'once is a swim, not a trap');
  WT.note(goal, { x: 2066.4, y: 51.6, z: 1411.7 }, 30000);
  const t = WT.here(goal, feet, 31000);
  assert.ok(t); assert.equal(t.count, 2);
  assert.match(WT.says(t, goal, 31000), /^This water at \(2066, 51, 1411\) has had the body under 2 times in the last 1 minute: each time the swim to the bank got it out, and the walk went back in\. The work under way is go to end portal toward \(2052, 1511\), and its walk is what brings the body back here\./);
  assert.equal(WT.here(goal, { x: 2080, y: 51, z: 1411 }, 31000), null, 'other water');
  const bot = {};
  assert.equal(WT.keepOut(bot, goal, t, 31000), 54);
  assert.equal(WT.refused(bot, { x: 2066, y: 51, z: 1411 }, 32000), true);
  assert.equal(WT.refused(bot, { x: 2067, y: 53, z: 1412 }, 32000), true);
  assert.equal(WT.refused(bot, { x: 2069, y: 51, z: 1411 }, 32000), false);
  assert.equal(WT.refused(bot, { x: 2066, y: 51, z: 1411 }, 31000 + WT.KEEP_OUT_MS + 1), false, 'ten minutes on, the cells are open again');
  assert.equal(WT.here(goal, feet, 31000 + WT.WINDOW_MS + 1), null, 'and the count has lapsed');
});

test('the ways offered: keep out always (once), the fill with a block carried and a bank, the boat when given', () => {
  const bot = { inventory: { items: () => [{ name: 'cobblestone', count: 3 }] }, chat: () => {} };
  const t = { x: 1, y: 60, z: 1, count: 3, first: 0, last: 0 };
  const w = WT.ways(bot, {}, {}, null, t, { land: { x: 3, y: 62, z: 1 }, boat: { description: 'boat', run: async () => true } });
  assert.deepEqual(Object.keys(w), ['keep_out_of_walk', 'fill_it_from_the_bank', 'boat_out']);
  assert.match(w.fill_it_from_the_bank.description, /fill this water's cell at \(1, 60, 1\) with a cobblestone \(3 carried\)/);
  const w2 = WT.ways({ inventory: { items: () => [] } }, {}, {}, null, { ...t, keptOut: Date.now() }, {});
  assert.deepEqual(Object.keys(w2), []);
});
