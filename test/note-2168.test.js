'use strict';
// Note 2168: what each stance came to at this health on the full runs, said on every stance option.
const test = require('node:test');
const assert = require('node:assert/strict');
const SR = require('../src/stance-record');

test('the run from mobs at 12 health in iron says its own record and the ways beside it, the safest first', () => {
  const s = SR.says('run_from', 12, 14, ['fight', 'retreat', 'run_from', 'shield_guard', 'none_good']);
  assert.match(s, /^ The day's record \(2026-10-25 06:00Z to 2026-10-26 07:50Z, the full runs\): run from chosen at 11-15 health in armour was followed by a death within a minute 3 times of 21; beside it here: /);
  assert.match(s, /fight \d+ of \d+/);
  assert.ok(s.indexOf('fight') < s.indexOf('shield guard') || s.indexOf('fight') < s.indexOf('retreat'), 'the lower death share first');
});

test('a bare bot at 3 health: the row with next to no armour on; an unknown way says nothing; few picks fall back to all', () => {
  assert.match(SR.says('run_from', 3, 0, []), / run from chosen at 0-5 health with next to no armour on was followed by a death within a minute 9 times of 14\.$/);
  assert.equal(SR.says('some_new_way', 10, 0, []), '');
  assert.equal(SR.bandOf(5), '0-5'); assert.equal(SR.bandOf(6), '6-10'); assert.equal(SR.bandOf(16), '16-20');
  const r = SR.rowOf('fight', 20, 14); assert.deepEqual(r, { died: 1, picks: 358, arm: 'armoured' });
});
