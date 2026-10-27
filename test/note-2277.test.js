'use strict';
// Note 2277: the shot at the dragon says its flight time and what shots of that flight came to in the record.
const test = require('node:test');
const assert = require('node:assert/strict');
const { shotFlightSays } = require('../src/end-combat');

test('a near shot and a far one say their band', () => {
  assert.match(shotFlightSays(0.6), /^This arrow flies about 0\.6 seconds to the dragon\..*This one is in the first band, 156 picks for 120\.$/);
  assert.match(shotFlightSays(2.3), /This one is in the last band, 20 picks for 0\.$/);
});
