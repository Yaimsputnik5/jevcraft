'use strict';
// Note 2175: the boat question's facts (swim vs boat seconds, the boat to make, health and food), from land and from the water.
const test = require('node:test');
const assert = require('node:assert/strict');
const { tripFacts } = require('../src/boats');

const bot = items => ({ health: 9, food: 7, time: { timeOfDay: 1000 }, entities: {}, findBlock: () => null, inventory: { items: () => items } });

test('tripFacts says the swim and the boat as seconds, what boat there is, and health and food as facts', () => {
  const trip = { length: 80, progress: 60 };
  const f = tripFacts(bot([{ name: 'oak_boat', count: 1 }]), { request: 'wool' }, trip);
  assert.equal(f.swimSecondsWithoutBoat, 40);
  assert.equal(f.boatSeconds, 14);
  assert.equal(f.carriedBoat, 'oak_boat');
  assert.equal(f.boatToMake, null);
  assert.equal(f.health, 9);
  assert.match(f.healthSays, /^9 health and 7 hunger; a swimmer is slow/);
  assert.equal(f.fromTheWater, undefined);
  assert.equal(f.safeShoreAtBothEnds, true);
  const g = tripFacts(bot([{ name: 'oak_planks', count: 3 }, { name: 'oak_log', count: 2 }]), { request: 'wool' }, trip, { fromWater: true });
  assert.equal(g.carriedBoat, null);
  assert.equal(g.boatToMake.says, 'no boat carried; one is made at a crafting table on land, not in the water');
  assert.match(g.fromTheWater, /^the bot is in the water now/);
  assert.equal(g.safeShoreAtBothEnds, false);
  const h = tripFacts(bot([{ name: 'oak_planks', count: 3 }, { name: 'oak_log', count: 2 }]), { request: 'wool' }, trip);
  assert.equal(h.boatToMake.says, 'no boat carried; five planks at a crafting table make one (3 planks and 2 logs carried, no table in view)');
});
