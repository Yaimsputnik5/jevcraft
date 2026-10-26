'use strict';
// The run's pace as measured, said and priced on the chase (note 2162).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const rp = require('../src/run-pace');
const { chaseSays } = require('../src/survival');

test('runs are noted and the bot\'s own pace is the median of three or more; fewer fall to the fleet record', () => {
  const state = {};
  assert.equal(rp.paceOf(state), null);
  rp.note(state, { blocks: 8, seconds: 4, mob: 'zombie' });
  rp.note(state, { blocks: 16, seconds: 4, mob: 'zombie' });
  assert.equal(rp.paceOf(state), null, 'two runs are not a record');
  rp.note(state, { blocks: 12, seconds: 4, mob: 'spider' });
  assert.deepEqual(rp.paceOf(state), { runs: 3, median: 3, quarter: 2 });
  assert.equal(rp.runPace(null), 2.9);
  assert.match(rp.says(null), /on the six full runs \(2026-10-25 18:00Z to 2026-10-26 06:40Z\) 156 runs from mobs made a median 2.9 blocks a second over their first four seconds/);
  assert.match(rp.says(rp.paceOf(state)), /this bot's own last 3 runs from mobs made a median 3 blocks a second over their first four seconds, a quarter of them under 2/);
  rp.note(state, { blocks: 1, seconds: 0.2 }, 'too short a run is not counted');
  assert.equal(state.runPaces.length, 3);
});

test('the chase is priced by the measured pace: a zombie at 2.3 is 0.6 a second slower than a run of 2.9, not 3.3 slower than a sprint', () => {
  const bot = { entity: { position: new Vec3(0, 64, 0) }, health: 20, inventory: { items: () => [], slots: [] } };
  const zombie = { entity: { name: 'zombie', id: 1, position: new Vec3(5, 64, 0) }, distance: 5, visible: true };
  const plain = chaseSays(bot, [zombie]);
  assert.match(plain, /They follow a running player \(a sprint on open ground is 5\.6 blocks a second; on the six full runs/);
  assert.match(plain, /the zombie 5 blocks off at about 2\.3 blocks a second, about 0\.6 a second slower than the run/);
  const own = chaseSays(bot, [zombie], { pace: { runs: 5, median: 2, quarter: 1.2 } });
  assert.match(own, /this bot's own last 5 runs from mobs made a median 2 blocks a second/);
  assert.match(own, /at about 2\.3 blocks a second, as fast as the run or faster/);
});
