'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Note 2123: the deaths near a place, said where the place is chosen.
test('deaths near a point in the last day are counted and said by cause, with the bare ones and the last', () => {
  const { deathsNearSays, deathsNear } = require('../src/death-places');
  const now = Date.parse('2026-10-26T01:30:00Z');
  const bot = { _survivalState: { deaths: [
    { at: '2026-10-26T01:10:45Z', position: { x: -1193, y: 68, z: 279 }, cause: 'was impaled by Drowned', worn: [] },
    { at: '2026-10-26T01:24:40Z', position: { x: -1160, y: 63, z: 300 }, cause: 'was slain by Drowned', worn: ['shield'] },
    { at: '2026-10-25T23:26:31Z', position: { x: -1138, y: 92, z: 129 }, cause: 'was impaled on a stalagmite', worn: [] },
    { at: '2026-10-24T20:00:00Z', position: { x: -1191, y: 67, z: 279 }, cause: 'was slain by Zombie', worn: ['iron_helmet'] } ] } };
  const bed = { x: -1191, y: 67, z: 279 };
  assert.equal(deathsNear(bot, bed, { now }).length, 2, 'the stalagmite 158 blocks off and the day-old zombie are not counted');
  assert.equal(deathsNearSays(bot, bed, { what: 'that bed', now }), ' 2 deaths within 48 blocks of that bed in the last 24 hours: 1 impaled by Drowned, 1 slain by Drowned (2 with no armour on); the last 5 minutes ago. The mobs that spawn by a place come back each night while the place is the same.');
  assert.equal(deathsNearSays(bot, { x: 0, y: 64, z: 0 }, { now }), '');
});
