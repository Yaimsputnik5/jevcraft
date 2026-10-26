'use strict';
// Note 2153: a food plan ends on enough carried (the floor kept here, or the
// hunger filled), not on the first point.
const test = require('node:test');
const assert = require('node:assert/strict');
const { begin, endOf } = require('../src/food-plan');

test('a berry does not end the plan; the floor does, and so does filling the hunger', () => {
  const bot = { food: 14, health: 20, game: { dimension: 'overworld' }, entity: { position: { x: 0, y: 64, z: 0 } }, inventory: { items: () => [] } };
  const goal = { kind: 'win', survival: {} };
  const holder = {};
  const p = begin(holder, bot, { choice: 'food', by: 'survival_priority', supply: 0, goal });
  assert.ok(p && p.facts.floor >= 1);
  const now = p.at + 1000;
  assert.equal(endOf(p, bot, { supply: 2, goal, now }), null, 'two points carried: the plan holds');
  assert.match(endOf(p, bot, { supply: p.facts.floor, goal, now }) || '', /^food is carried: 0 to \d+ food points$/);
  assert.match(endOf(p, bot, { supply: 6, goal, now }) || '', /^food is carried: 0 to 6 food points$/, 'hunger 14: six points fill it');
});
