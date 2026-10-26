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
  assert.match(fresh, /^ On this run: 3 deaths and no walk back set out yet\. On the 7 full runs of 2026-10-19 to 2026-10-25: 288 deaths, 74 walks back set out, the kit back whole 0 times and in part 0; 18 found nothing where the bot died \(7 of them within three minutes of the death\), 14 ended in a death on the way/);
  assert.match(fresh, /an item lying within 176 blocks of a player is gone five minutes after it fell there \(farther off it waits\); zombies and skeletons may pick up armour and weapons they walk over/);
  const goal = { corpseRecord: { begun: 4, done: 0, partial: 0, gone: 2, diedOnWay: 1, left: 3, despawned: 1 } };
  assert.match(recordSays(bot, goal), /^ On this run: 3 deaths, 4 walks back set out, 0 got everything back, 0 some of it, 2 found nothing where it died, 1 ended in a death on the way, 3 left the drops, 1 gone before the bot came\./);
});
