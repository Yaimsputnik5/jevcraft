'use strict';
// Note 2084: the climbs to open sky chosen in the last hour are said at the
// next surface trip, with what they were for and their minutes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { noteClimb, climbsLatelySays } = require('../src/work');

test('climbs of the last hour are counted by need; older ones are not', () => {
  const goal = {}, now = Date.now();
  noteClimb(goal, 'wood (any log)', { up: 22, seconds: 120 }, now - 70 * 60000);
  noteClimb(goal, 'sheep', { up: 19, seconds: 110 }, now - 20 * 60000);
  noteClimb(goal, 'sheep', { up: 21, seconds: 130 }, now - 5 * 60000);
  assert.equal(climbsLatelySays(goal, now), 'In the last hour 2 climbs to open sky were chosen (2 for sheep), about 4 minutes of climbing said for them and 40 blocks up, each leaving the work below and coming back down to it; what is owed at the surface taken in one trip saves the others.');
  assert.equal(climbsLatelySays({}, now), null);
});

test('climb_out says the climbs of the last hour and counts its own once (note 2085)', () => {
  const src = require('fs').readFileSync(require.resolve('../src/surface'), 'utf8');
  assert.match(src, /facts\.climbsLately = lately/);
  assert.match(src, /noteClimb\(goal, goal\.surfaceTrip\?\.need \|\| 'the way up'/);
  assert.match(src, /Date\.now\(\) - c\.at < 3 \* 60000/);
});

test('cooking says the points it gains in the minutes of getting food (note 2101)', () => {
  const { cookTimeSays } = require('../src/work');
  assert.equal(cookTimeSays(28, 76), " The +28 points are about 5 to 7 minutes of getting food at the fresh runs' pace (3.9 to 5.9 food points a minute of hunting and searching), against the 76 seconds here; eaten raw, the meat gives a third of it.");
  assert.equal(cookTimeSays(0, 10), '');
});
