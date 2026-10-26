'use strict';
// Note 2137: how soon this run's deaths followed the death before, bare
// against in armour, said with recentDeaths.
const test = require('node:test');
const assert = require('node:assert/strict');
const { deathSpells } = require('../src/decisions');

test('bare deaths soon after the last, armoured ones hours apart', () => {
  const t0 = Date.parse('2026-10-26T00:00:00Z');
  const at = m => new Date(t0 + m * 60000).toISOString();
  const deaths = [
    { at: at(0), worn: ['iron_helmet', 'iron_chestplate'] },
    { at: at(16), worn: [] },
    { at: at(33), worn: ['shield'] },
    { at: at(154), worn: ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'shield'] },
    { at: at(300), worn: ['iron_chestplate'] },
  ];
  assert.equal(deathSpells({ survival: { deaths } }, t0 + 310 * 60000),
    'Of this run\'s 5 deaths in the last 24 hours, the 2 with no armour worn came a median 16 minutes after the death before (16 minutes to 17 minutes); the 2 in armour came a median 2 hours after the death before (2 hours to 2 hours).');
  assert.equal(deathSpells({ survival: { deaths: deaths.slice(0, 1) } }, t0 + 60000), null, 'one death: nothing to compare');
  assert.equal(deathSpells({ survival: { deaths } }, t0 + 30 * 3600000), null, 'a day on: out of the window');
});
