'use strict';
// full-3 (2026-10-24 07:03 to 07:42Z) died at its cave bed eight times in 40 minutes; the user (2026-10-24) asked for the
// bed to be offered taken up where deaths repeat beside it (note 2053).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

test('two deaths in half an hour beside the bed slept in, the bot beside it: taking it up is offered with the deaths', () => {
  const { bedLoopOf } = require('../src/survival');
  const now = Date.parse('2026-10-24T07:10:00Z');
  const bot = { game: { dimension: 'overworld' }, entity: { position: new Vec3(2048.5, -13, 1306.5) } };
  const state = { spawnBed: { foot: { x: 2047, y: -13, z: 1305 } }, deaths: [
    { at: '2026-10-24T06:59:53Z', position: { x: 1661, y: 18, z: 1065 } },
    { at: '2026-10-24T07:03:13Z', position: { x: 2030, y: 2, z: 1292 } },
    { at: '2026-10-24T07:06:02Z', position: { x: 2053, y: -10, z: 1307 } },
    { at: '2026-10-24T07:08:44Z', position: { x: 2048, y: -10, z: 1298 } },
  ] };
  const loop = bedLoopOf(bot, state, now);
  assert.ok(loop);
  assert.equal(loop.deaths, 2, 'the two within sixteen of the bed');
  assert.match(loop.says, /2 deaths within sixteen blocks of it in the last 4 minutes, each back to life here with nothing on\. Taken up, the next death comes back to life at the world spawn instead/);
  assert.equal(bedLoopOf(bot, state, now + 40 * 60000), null, 'half an hour on: no loop');
  assert.equal(bedLoopOf({ ...bot, entity: { position: new Vec3(2100, -13, 1306) } }, state, now), null, 'away from the bed: not offered');
  assert.equal(bedLoopOf(bot, { ...state, deaths: state.deaths.slice(0, 3) }, now), null, 'one death beside it: not a loop');
});

// full-2's run to the dragon spent 17.1 of 108.6 hours sealed in awake (note 2054).
test('the sealed wait says its minutes to dawn, that it gains nothing, and the run\'s hours so spent', () => {
  const { sealedWaitCostSays } = require('../src/survival');
  const bot = { time: { timeOfDay: 13000 } };
  const goal = { gameProgress: { clock: { playedMs: 108.6 * 3.6e6, byDoing: { wait_in_shelter: 17.1 * 3.6e6 } } } };
  assert.match(sealedWaitCostSays(bot, goal), /^ Sealed, the bot waits about \d+ real minutes to dawn and gains nothing meanwhile unless it mines\. This run so far: 17\.1 of its 108\.6 hours of play spent so, sealed in awake\.$/);
  assert.doesNotMatch(sealedWaitCostSays(bot, {}), /This run so far/);
});
