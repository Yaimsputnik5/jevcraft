'use strict';
// Note 1959. When Jev answers none_good, the least bad of the options listed
// is taken; one that failed here just now is not it while another is listed.
// full-4 (2026-10-20 12:34:05 and 12:34:09Z, 3.6 health, a ghast 34 blocks
// off) was handed 'fight' twice as the least bad with 'fight' in
// failedHereJustNow 3 and 6 seconds before; full-3 (08:18:56Z) 'cap_fight'
// with cap_fight failed five times in the three seconds before, and died on it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickWhenNoneGood } = require('../src/decisions');

test('the least bad when none is good is never a choice that failed here just now, while another is listed (note 1959)', () => {
  const listed = { fight: { expects: { damage: 23.9, seconds: 15 } }, retreat: { expects: { damage: 30, seconds: 15 } }, fight_from_footing: { expects: { damage: 40, seconds: 15 } }, none_good: {} };
  const weights = { fight: 0.3, retreat: 0.2, fight_from_footing: 0.1, none_good: 0.4 };
  assert.equal(pickWhenNoneGood(listed, weights, 3.6).key, 'fight', 'with nothing failed, the least in fifteen seconds');
  assert.equal(pickWhenNoneGood(listed, weights, 3.6, ['fight']).key, 'retreat', 'fight failed here just now: the next least bad');
  assert.equal(pickWhenNoneGood(listed, weights, 3.6, ['fight', 'retreat', 'fight_from_footing']).key, 'fight', 'every one failed: the least bad of them all, as before');
  assert.equal(pickWhenNoneGood({ fight: {}, keep_working: {}, none_good: {} }, { fight: 0.5, keep_working: 0.1 }, 20, ['fight']).key, 'keep_working', 'unpriced: the next by weight');
});
