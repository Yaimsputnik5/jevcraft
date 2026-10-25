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
