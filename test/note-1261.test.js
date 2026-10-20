'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { collectStage } = require('../src/rod-stash');

test('the chest just filled beside the bot is taken last: the far one first, and it alone when nothing else is left (note 1261)', () => {
  const now = Date.parse('2026-10-04T22:50:00Z');
  const bot = { entity: { position: new Vec3(-60.5, 60, 0.5) }, game: { dimension: 'the_nether' } };
  const fresh = { position: { x: -62, y: 60, z: 1 }, dimension: 'nether', contents: { ender_pearl: 11 }, storedAt: new Date(now - 5000).toISOString() };
  const far = { position: { x: -254, y: 60, z: -339 }, dimension: 'nether', contents: { blaze_rod: 1 }, storedAt: '2026-10-04T08:24:06.000Z' };
  const goal = { rodStashes: [fresh, far] };
  assert.deepEqual(collectStage(bot, goal, now).at, { x: -254, y: 60, z: -339 });
  far.contents = {};
  assert.deepEqual(collectStage(bot, goal, now).at, { x: -62, y: 60, z: 1 }, 'the way out: what was put down is taken up');
  // An old chest beside the bot is the nearest, as before.
  fresh.storedAt = new Date(now - 3600000).toISOString(); far.contents = { blaze_rod: 1 };
  assert.deepEqual(collectStage(bot, goal, now).at, { x: -62, y: 60, z: 1 });
});

test('a take rested for a walk that failed from far off is taken once the bot stands beside the chest (full-2 2026-10-20 21:48Z, note 1976)', () => {
  const now = Date.parse('2026-10-20T21:48:00Z');
  const { setAside } = require('../src/progress');
  const chest = { position: { x: -295, y: 30, z: -219 }, dimension: 'overworld', contents: { ender_pearl: 1 }, storedAt: '2026-10-19T20:18:25.404Z', takeFails: 1, takeFailFrom: 222 };
  const goal = { rodStashes: [chest] };
  setAside(goal, 'rod_stash_take', '(-295, 30, -219)', new Error('Took to long to decide path to goal!'), 600000);
  const far = { entity: { position: new Vec3(-100.5, 64, -100.5) }, game: { dimension: 'overworld' } };
  assert.equal(collectStage(far, goal, Date.now()), null, 'still far off: the rest holds');
  const beside = { entity: { position: new Vec3(-295.5, 29, -218.5) }, game: { dimension: 'overworld' } };
  assert.deepEqual(collectStage(beside, goal, Date.now())?.at, { x: -295, y: 30, z: -219 });
  chest.takeFailFrom = 2;
  assert.equal(collectStage(beside, goal, Date.now()), null, 'a take that failed from beside it still rests');
});
