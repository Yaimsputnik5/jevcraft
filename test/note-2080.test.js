'use strict';
// Note 2080: a rung's minutes by what they went on, tallied as the bot plays
// and said beside the rung at the strategy's asking. full-7 (2026-10-24
// 19:48Z to 02:20Z) spent 106 of 406 minutes stuck and 138 on walks and
// searches, its rungs said only "worked on for N minutes".
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const tb = require('../src/time-buckets');

test('what the bot does falls in one bucket; standing still at work that is not done standing is stuck', () => {
  assert.equal(tb.bucketOf('mine'), 'work');
  assert.equal(tb.bucketOf('mine', true), 'stuck');
  assert.equal(tb.bucketOf('smelt', true), 'work', 'smelting stands still');
  assert.equal(tb.bucketOf('cross_toward'), 'travel');
  assert.equal(tb.bucketOf('wait_in_shelter', true), 'waiting');
  assert.equal(tb.bucketOf('work_free'), 'stuck');
});

test('the trail tallies the rung\'s minutes by bucket, stuck where the body has not moved in a minute and a half (note 2080)', () => {
  const { noteTrail } = require('../src/stillness');
  const bot = { entity: { position: new Vec3(10.5, 64, 10.5) }, time: { timeOfDay: 6000 }, game: { dimension: 'overworld' } };
  const goal = { step: { action: 'mine' }, rungTime: { phase: 'iron_pickaxe' }, gameProgress: { phase: 'iron_pickaxe' } };
  const t0 = Date.now();
  for (let i = 0; i <= 12; i++) noteTrail(bot, goal, t0 + i * 15000);
  const tally = goal.rungBuckets.iron_pickaxe;
  assert.ok(tally.stuck >= 60000, JSON.stringify(tally));
  assert.ok(tally.work >= 60000, JSON.stringify(tally));
});

test('the rung said at the strategy\'s asking carries where its minutes went (note 2080)', () => {
  const says = tb.bucketsSays({ work: 12 * 60000, travel: 8 * 60000, stuck: 14 * 60000, waiting: 30000 });
  assert.equal(says, ' Of its 35 minutes of play so far: 14 stuck in one place (within 3 blocks for a minute and a half, or working free of a stall); 12 at the work itself (mining, tunnelling, smelting, crafting); 8 on walks, climbs and searches.');
  assert.equal(tb.bucketsSays({ work: 60000 }), '', 'under two minutes: nothing said');
});

test('a detour is bucketed by what was chosen for it: a night mine is work, the wait for a rest is waiting (note 2104)', () => {
  const tb = require('../src/time-buckets');
  assert.equal(tb.bucketOf('detour:night_mine'), 'work');
  assert.equal(tb.bucketOf('detour:mine_nearby'), 'work');
  assert.equal(tb.bucketOf('detour:night_mine', true), 'stuck', 'still within three blocks for a minute and a half');
  assert.equal(tb.bucketOf('detour:until_rest_ends'), 'waiting');
  assert.equal(tb.bucketOf('detour:look_around'), 'stuck');
  assert.equal(tb.bucketOf('detour:differently'), 'stuck');
  assert.equal(tb.bucketOf('detour'), 'stuck');
});
