'use strict';
// Note 2180: the run's own nights said on the bed-after-sleep options.
const test = require('node:test');
const assert = require('node:assert/strict');
const { runNightsSays } = require('../src/night-ahead');
const { bedAfterSleepTree } = require('../src/survival');

test('the run line: waiting as hours and a share of play, mining and sleep beside it', () => {
  const goal = { gameProgress: { clock: { playedMs: 150.1 * 3600000, byDoing: { wait_in_shelter: 21.8 * 3600000, night_mine: 2.5 * 3600000, sleep: 20 * 60000 } } } };
  assert.equal(runNightsSays(goal), ' This run so far: 21.8 hours sealed in waiting through nights (15% of its 150.1 hours of play), 2.5 hours night-mining, 20 minutes asleep; a night with a bed carried and set down at bedtime passes in seconds, one waited out awake is about 11.3 real minutes.');
  assert.equal(runNightsSays({}), '');
  const bot = { inventory: { items: () => [] }, entity: { position: { x: 0, y: 64, z: 0 } }, spawnPoint: { x: 100, y: 64, z: 0 } };
  const tree = bedAfterSleepTree(bot, { deaths: [] }, Date.now(), { goal });
  for (const k of ['leave_as_respawn', 'take_bed_along']) assert.match(tree[k].description, /This run so far: 21\.8 hours sealed in waiting/);
});
