'use strict';
// Note 2139: the bed's record says what the full runs spent on it and on the
// nights without it, beside the fresh trials' 2.7 minutes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { rungRecordSays, fullBedSays } = require('../src/kit-record');

test('the full runs\' bed record', () => {
  assert.equal(fullBedSays(), 'On the 7 full runs (2026-10-19 to 10-26, 26.9 to 145.1 hours played): the bed rung took 29 to 555 minutes (a median 71; the wool 12 to 178), the nights waited out in a shelter 55 to 1273 minutes (the three 145-hour runs 16 to 21 hours each; a night awake is about eight and a half real minutes from bedtime, a night slept passes in seconds), and 3.7 to 22.6 minutes asleep in all');
  assert.match(rungRecordSays('bed'), /a median 2\.7 minutes each.*; On the 7 full runs \(2026-10-19 to 10-26/);
  assert.doesNotMatch(rungRecordSays('shield'), /full runs/);
});
