'use strict';
// Note 2200: shoot_dragon says what it came to this fight. dragon-313
// (25592, 2026-10-26 10:38 to 11:09Z) chose it 90 times in 31 minutes,
// 19 picks ended before an arrow left the bow, the dragon lost 10 health to
// the arrows in all, and the option read the same each time: 'the checked
// clear trajectory', 'safeFiringPosition true'.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dragonShotsSays } = require('../src/end-combat');

test('not chosen yet: said so, with the dragon\'s health', () => {
  assert.equal(dragonShotsSays({ shots: [] }, 200), "not chosen yet this fight; the dragon's health 200 of 200");
});

test('dragon-313\'s record: the picks, the arrows loosed, the health lost to them, and how the rest ended', () => {
  const state = { fightStartedAt: 1000, dragonShots: { chosen: 90, loosed: 3, ended: { 'No clear observed arrow trajectory to this target': 6, 'cut by an emergency': 6, 'End firing position became unsafe': 4, 'The dragon perched while drawing': 1 } },
    shots: [{ target: 'ender_dragon', at: 2000, dragonBefore: 200, dragonAfter: 197 }, { target: 'ender_dragon', at: 3000, dragonBefore: 197, dragonAfter: 190 }, { target: 'ender_dragon', at: 4000, dragonBefore: 190, dragonAfter: 190 }, { target: 'end_crystal', at: 5000 }, { target: 'ender_dragon', at: 500, dragonBefore: 200, dragonAfter: 100 }] };
  assert.equal(dragonShotsSays(state, 186), 'chosen 90 times this fight: 3 arrows left the bow at the dragon and it lost 10 health in the seconds after them (its health 186 of 200 now); the other 87 picks ended before any arrow: No clear observed arrow trajectory to this target 6, cut by an emergency 6, End firing position became unsafe 4, The dragon perched while drawing 1');
});
