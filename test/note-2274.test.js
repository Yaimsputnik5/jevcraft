'use strict';
// Note 2274: each way at encounter_stance with a blaze about says what it came to in the record.
const test = require('node:test');
const assert = require('node:assert/strict');
const { blazeStanceSays } = require('../src/survival');

test('the charge and the ambush say their record; a way with none says nothing', () => {
  assert.match(blazeStanceSays('charge_nearest'), /this way chosen with a blaze about: 100 times; a death within a minute 4 of them, 9 rods got within five minutes \(whatever came after\), 2\.6 health lost/);
  assert.match(blazeStanceSays('corner_ambush'), /24 times; a death within a minute none of them, 4 rods/);
  assert.equal(blazeStanceSays('pillar'), '');
});
