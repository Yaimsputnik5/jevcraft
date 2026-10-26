'use strict';
// Note 2165: the hunger the work below costs, against the food carried and the animals in view, said before the dig down.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const fh = require('../src/food-horizon');

function botWith({ items = [], prey = [] } = {}) {
  const entities = {};
  prey.forEach((p, i) => { entities[i + 1] = { id: i + 1, name: p.name, position: new Vec3(p.d, 64, 0), isValid: true, metadata: [] }; });
  return { entity: { position: new Vec3(0, 64, 0) }, entities, inventory: { items: () => items }, registry: require('minecraft-data')('26.1'), game: { dimension: 'overworld' } };
}

test('the work below is priced in minutes and hunger, the food carried and the animals in view said (full-1, 2026-10-26 06:32Z)', () => {
  const goal = { climbLog: [{ at: Date.now() - 3600000, need: 'food animals', seconds: 120 }, { at: Date.now() - 7200000, need: 'sheep', seconds: 300 }, { at: Date.now() - 1000, need: '1 oak log', seconds: 60 }] };
  const h = fh.horizon(botWith({ prey: [{ name: 'sheep', d: 20 }, { name: 'cow', d: 30 }] }), goal, { drop: 'raw_iron', wanted: 20, digSecs: 53, climbSecs: 105, depth: 16 });
  assert.equal(h.rate.perHour, 220, 'the fleet rate with no record of the band');
  assert.equal(h.minutes, 8.1);
  assert.equal(h.hunger, 3.2);
  assert.equal(h.carried, 0);
  assert.equal(h.target, 4);
  assert.match(h.says, /^The work below is about 8\.1 minutes \(20 raw iron at about 220 an hour there, the fresh runs' rate, with the dig down and the climb back\); hunger drains about 24 points an hour under the surface, about 3\.2 points over that work\. Food carried: 0 points \(nothing to eat\)/);
  assert.match(h.says, /Animals in view now: a sheep 20 blocks off \(\d+ points cooked\), a cow 30 blocks off \(\d+ points cooked\): about \d+ points in all\./);
  assert.match(h.says, /climbs to open sky for food in the last 24 hours: 2, about 7 minutes of climbing said for them/);
});

test('this run\'s own rate at the band is used where it has five minutes there; no animal in view is said', () => {
  const goal = { oreByDepth: { y16under: { ms: 10 * 60000, found: { raw_iron: 30 } } } };
  const h = fh.horizon(botWith({ items: [{ name: 'cooked_beef', count: 2 }] }), goal, { drop: 'raw_iron', wanted: 20, digSecs: 0, climbSecs: 0, depth: 10 });
  assert.equal(h.rate.perHour, 180);
  assert.match(h.says, /this run's own rate y 16 and under/);
  assert.match(h.says, /No animal is in view now\./);
  assert.equal(h.prey.length, 0);
});
