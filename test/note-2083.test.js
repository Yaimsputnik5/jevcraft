'use strict';
// Note 2083: the food carried into the Nether said at the rate blaze fights
// eat it, beside the stay's forty an hour. full-7 (2026-10-25 03:24Z) went on
// with 28 points told "about 42 minutes of it" and ate them in four minutes
// at a spawner.
const test = require('node:test');
const assert = require('node:assert/strict');
const { blazeFoodSays } = require('../src/nether-food');

test('28 points carried: about 16 minutes at a blaze spawner, said with the record', () => {
  assert.equal(blazeFoodSays(28), " With blazes about the bots ate about 1.7 food points a minute (37 stretches of a minute or more, 140 minutes, October's flight records), healing what their fire takes: 28 points is about 16 minutes at a blaze spawner.");
  assert.equal(blazeFoodSays(0), '');
});

test('the stay\'s and keep-on\'s texts carry it', () => {
  const src = require('fs').readFileSync(require.resolve('../src/nether-food'), 'utf8');
  assert.equal((src.match(/blazeFoodSays\((stay\.carried|stock\.points)\)/g) || []).length, 3);
});
