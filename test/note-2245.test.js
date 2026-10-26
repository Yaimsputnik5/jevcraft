'use strict';
// Note 2245: the Nether stays kept on the goal and said on the questions that spend Nether time.
const test = require('node:test');
const assert = require('node:assert/strict');
const NR = require('../src/nether-record');

const registry = require('prismarine-registry')('26.1');
const bot = (dimension, items, food = 20) => ({ game: { dimension }, food, registry, health: 20, inventory: { items: () => items } });

test('a stay is opened in the Nether, closed out of it with how it ended, and said with its minutes and its gains', () => {
  const goal = { survival: { deaths: [] } }, t0 = Date.parse('2026-10-26T12:00:00Z');
  NR.noteStint(bot('the_nether', [{ name: 'cooked_beef', count: 4 }, { name: 'blaze_rod', count: 2 }]), goal, t0);
  NR.noteStint(bot('the_nether', [{ name: 'cooked_beef', count: 1 }, { name: 'blaze_rod', count: 5 }, { name: 'ender_pearl', count: 1 }], 12), goal, t0 + 30 * 60000);
  assert.match(NR.stintsSays(null, goal, t0 + 30 * 60000), /^This stay in the Nether: 30 minutes so far, come in with 32 food points carried, 2 rods and 0 pearls; now 8 food points, \+3 rods, \+1 pearls on the stay, hunger 12\.$/);
  NR.noteStint(bot('overworld', []), goal, t0 + 31 * 60000);
  assert.equal(goal.netherStints[0].how, 'came out alive');
  NR.noteStint(bot('the_nether', []), goal, t0 + 60 * 60000);
  goal.survival.deaths.push({ at: new Date(t0 + 70 * 60000).toISOString(), dimension: 'the_nether' });
  NR.noteStint(bot('overworld', []), goal, t0 + 71 * 60000);
  assert.equal(goal.netherStints[1].how, 'died there');
  assert.match(NR.stintsSays(null, goal, t0 + 72 * 60000), /^This run's last 2 stays before: 30 minutes, came out alive, 32 food points carried in, \+3 rods, \+1 pearls; 0 minutes, died there/);
  assert.equal(NR.stintsSays(null, {}), '');
});
