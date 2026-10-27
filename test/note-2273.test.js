'use strict';
// Note 2273: the kit lost at a death and the time until as much iron is worn again, said to Jev from the run's own record.
const test = require('node:test');
const assert = require('node:assert/strict');
const { observeProgress } = require('../src/game-progress');
const { ironRemakeSays } = require('../src/corpse-run');

test('a kit lost is counted back when as many iron pieces are worn again, and said in the run\'s own minutes', () => {
  const lostAt = Date.parse('2026-10-27T01:00:00Z');
  const goal = { survival: { kitLost: { at: new Date(lostAt).toISOString(), pieces: 3 } } };
  const slots = { 5: { name: 'iron_helmet' }, 6: { name: 'iron_chestplate' } };
  const bot = { game: { dimension: 'overworld' }, entity: { position: { x: 0, y: 64, z: 0 } }, inventory: { items: () => [], slots } };
  observeProgress(bot, goal, lostAt + 30 * 60000);
  assert.ok(goal.survival.kitLost, 'two of three: not back yet');
  slots[7] = { name: 'iron_leggings' };
  observeProgress(bot, goal, lostAt + 84 * 60000);
  assert.equal(goal.survival.kitLost, undefined);
  assert.deepEqual(goal.survival.kitBack, [{ lostAt: '2026-10-27T01:00:00.000Z', minutes: 84 }]);
  assert.match(ironRemakeSays({ iron_chestplate: 1, iron_leggings: 1, iron_helmet: 1 }, goal), /^ On this run, the one kit lost at a death was back on the body after 84 minutes/);
  assert.match(ironRemakeSays({ iron_chestplate: 1, iron_leggings: 1, iron_helmet: 1 }, {}), /^ The 20 iron is about/);
});
