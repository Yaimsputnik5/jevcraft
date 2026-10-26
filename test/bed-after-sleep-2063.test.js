'use strict';
// The user, 2026-10-24: 'Get rid of my rules if they're not helping ... give jev more agency and better info' (note 2063).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

test('on waking, leaving the bed as the respawn or taking it along is offered, each with what it costs', () => {
  const { bedAfterSleepTree } = require('../src/survival');
  const now = Date.parse('2026-10-24T17:00:00Z');
  const bot = { entity: { position: new Vec3(300, 64, 0) }, spawnPoint: new Vec3(0, 64, 0),
    inventory: { items: () => [{ name: 'white_wool', count: 1 }, { name: 'string', count: 5 }] } };
  const tree = bedAfterSleepTree(bot, { deaths: [{ at: '2026-10-24T16:10:00Z' }, { at: '2026-10-24T12:00:00Z' }] }, now);
  assert.deepEqual(Object.keys(tree), ['leave_as_respawn', 'take_bed_along']);
  assert.match(tree.leave_as_respawn.description, /a death comes back to life here\. The next night needs another bed: 1 wool and 5 string \(four a wool\) carried, three wool a bed\./);
  assert.match(tree.take_bed_along.description, /Taken up, the respawn is the world spawn, 300 blocks from here, until the carried bed is next slept in.*the respawn follows the work\. This run's deaths in the last two hours: 1\./);
});

test('a bed the pockets make is offered as a second bed to carry, this one left as the respawn (note 2159)', () => {
  const { bedAfterSleepTree } = require('../src/survival');
  const bot = { entity: { position: new Vec3(300, 64, 0) }, spawnPoint: new Vec3(0, 64, 0),
    inventory: { items: () => [{ name: 'white_wool', count: 5 }, { name: 'oak_planks', count: 6 }] } };
  const tree = bedAfterSleepTree(bot, { deaths: [] }, Date.now(), { bedNow: { item: 'white_bed', from: '5 white wool' } });
  assert.deepEqual(Object.keys(tree), ['leave_as_respawn', 'take_bed_along', 'second_bed']);
  assert.match(tree.second_bed.description, /^Leave this bed standing as the respawn point and make another to carry, from what is carried \(5 white wool\), crafts alone/);
  assert.match(tree.second_bed.description, /sleeping in a bed moves the respawn to it/);
  assert.equal(Object.keys(bedAfterSleepTree(bot, { deaths: [] }, Date.now())).length, 2);
});
