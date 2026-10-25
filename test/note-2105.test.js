'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Note 2105: the rods' risk said from this run's own deaths and clock, not
// the records of 2026-09-29 to 10-03.
test('the rods carried are priced from the run\'s own deaths and the minutes its rods have taken', () => {
  const { runSays } = require('../src/rod-risk');
  const start = Date.parse('2026-10-24T19:45:00Z');
  const goal = { gameProgress: { clock: { startedAt: start, playedMs: 20 * 3600000, byDoing: { 'obtain_blaze_rods: hunt_mob': 90 * 60000, 'obtain_blaze_rods: find_fortress': 60 * 60000, 'reach_nether: mine': 600000 } } } };
  const bot = { _survivalState: { deaths: [
    { at: '2026-10-24T18:00:00Z', dimension: 'overworld' },
    { at: '2026-10-25T03:00:00Z', dimension: 'overworld' }, { at: '2026-10-25T08:00:00Z', dimension: 'the_nether' },
    { at: '2026-10-25T09:00:00Z', dimension: 'the_nether' }, { at: '2026-10-25T10:00:00Z', dimension: 'overworld' } ] }, inventory: { items: () => [] } };
  const eyeNeed = require('../src/eye-need'), need = eyeNeed.need;
  eyeNeed.need = () => ({ rodsWanted: 7, rodsLeft: 4 });
  try {
    assert.equal(runSays(bot, goal, 1), 'On this run so far: 4 deaths in 20 hours of play, about one each 300 minutes of play, 2 of them in the Nether. The blaze rods have taken 150 minutes of its clock for the 3 rods had, about 50 minutes a rod: the 1 rod carried is about 50 minutes to get again where a death drops them out of reach.');
  } finally { eyeNeed.need = need; }
  assert.equal(runSays(bot, { gameProgress: { clock: { playedMs: 600000 } } }, 1), '', 'no clock to speak of yet');
});
