'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Note 2115: the walk back for drops says this run's and the fleet's record
// of such walks, the game's five minutes within the ticking blocks, and the
// zombies' pickup; and the run keeps its record as the walks settle.
test('the corpse run says its record: the run\'s own as it accrues, the fleet\'s, and the game\'s part', () => {
  const { recordSays, FLEET_RECORD, TICKING } = require('../src/corpse-run');
  assert.equal(TICKING, 176, 'the trial servers\' simulation distance, 10 chunks, by chunk edges');
  assert.deepEqual([FLEET_RECORD.deaths, FLEET_RECORD.setOut, FLEET_RECORD.back, FLEET_RECORD.some], [288, 74, 0, 0]);
  const bot = { _survivalState: { deaths: [{}, {}, {}] } };
  const fresh = recordSays(bot, {});
  assert.match(fresh, /^ On this run: 3 deaths and no walk back set out yet\. On the 7 full runs of 2026-10-19 to 2026-10-25: 288 deaths and 74 walks back set out; 14 of the walks ended in a death on the way \(about 7 minutes out, about 350 blocks off\) and 18 found nothing where the bot died \(7 of them within three minutes of the death\); how many of the other 42 got the kit back that record does not say \(it was read from the server logs, which do not see a pickup\)\./);
  assert.match(fresh, /an item lying within 176 blocks of a player is gone five minutes after it fell there \(farther off it waits\); zombies and skeletons may pick up armour and weapons they walk over/);
  const goal = { corpseRecord: { begun: 4, done: 0, partial: 0, gone: 2, diedOnWay: 1, left: 3, despawned: 1 } };
  assert.match(recordSays(bot, goal), /^ On this run: 3 deaths, 4 walks back set out, 0 got everything back, 0 some of it, 2 found nothing where it died, 1 ended in a death on the way, 3 left the drops, 1 gone before the bot came\./);
});

// Issue #3 (note 2116): the idle run's task carries the decision client, as runGoal's does.
test('runIdle gives its task the decision client, so a hold in idle work is asked of Jev, not held as Jev down', async () => {
  const { runIdle } = require('../src/work');
  const { Task } = require('../src/skills');
  const client = { systemOne: async () => ({ answers: {} }) };
  const task = new Task('idle', 'idle');
  const bot = { entity: { position: { x: 0, y: 64, z: 0 } }, game: { dimension: 'overworld' }, inventory: { items: () => [], slots: [] }, on() {}, once() {}, off() {}, removeListener() {}, emit() {}, listenerCount: () => 0, pathfinder: { movements: {}, setGoal() {} }, entities: {}, blockAt: () => null };
  const survival = { state: {}, step: async () => false, stanceHeld: () => null };
  let calls = 0;
  try { await runIdle(bot, task, { kind: 'idle' }, { save() {} }, { survival, decisionClient: client, backoffMs: 1, until: () => ++calls > 1 }); } catch (_) { /* the stub bot ends the loop one way or another */ }
  assert.equal(task.opportunityClient, client);
});
