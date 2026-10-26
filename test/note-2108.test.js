'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Note 2108: what a bed does to the dragon, by the game's own rules (the
// 26.1.2 server jar), said on the bed bomb and the End kit's beds.
test('a bed by the dragon\'s head is priced by the game: 46 to 60 damage, one bed a perch, about four in all', () => {
  const { bedDamage, dragonBedSays, DRAGON } = require('../src/bed-bomb');
  assert.equal(bedDamage(1), 60);
  assert.equal(bedDamage(2.5), 46);
  assert.equal(bedDamage(10), 1);
  assert.deepEqual(DRAGON, { health: 200, perchCap: 50, bedNear: 60, bedFar: 46 });
  assert.match(dragonBedSays(), /about 46 to 60 damage to it, the head taking a blast whole .* the dragon has 200 health, and a perch ends once it has taken more than 50 there, so about one bed a perch and 4 in all; at a perch an arrow does it nothing/);
  assert.match(dragonBedSays(90), /200 health, 90 now, .* and 2 in all/);
});

test('the End kit\'s enter_now says what the beds carried are worth against the dragon when they are short (note 2120)', () => {
  const { bedsWorthSays } = require('../src/end-supplies');
  assert.match(bedsWorthSays([{ key: 'beds', short: true, carried: 1 }]), /^ With 1 bed: By the game's own rules .* about 46 to 60 damage to it/);
  assert.equal(bedsWorthSays([{ key: 'beds', short: false, carried: 4 }]), '');
  assert.equal(bedsWorthSays([{ key: 'arrows', short: true, carried: 0 }]), '');
});
