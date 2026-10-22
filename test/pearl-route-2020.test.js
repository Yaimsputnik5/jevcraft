'use strict';
// full-1 (2026-10-21 23:30 to 2026-10-22 02:51Z): four crossings for a warped sweep that found no forest, 73
// minutes on sweeps and none on the Overworld's endermen; the ladder crossed by rule (note 2020).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { Task } = require('../src/skills');

const bot = () => ({ entity: { position: new Vec3(-77, 64, 156) }, game: { dimension: 'overworld' }, time: { timeOfDay: 6000 }, entities: {}, inventory: { items: () => [] } });
const goal = () => ({ kind: 'win', portals: [], gameProgress: { clock: { byDoing: { 'obtain_ender_pearls: warped_search': 73 * 60000, 'obtain_ender_pearls: tunnel': 58 * 60000 } } } });

test('the Overworld asks which way to the pearls once the sweep has had its time, said with the record, and holds the answer', async () => {
  const routes = require('../src/pearl-routes');
  assert.equal(routes.routeAsked({ gameProgress: { clock: { byDoing: { 'obtain_ender_pearls: warped_search': 5 * 60000 } } } }), false);
  const g = goal(), b = bot();
  assert.equal(routes.routeAsked(g), true);
  const tree = routes.routeTree(b, g);
  assert.deepEqual(Object.keys(tree), ['warped_forest', 'overworld_hunt']);
  assert.match(tree.warped_forest.description, /about 131 minutes of play, 73 of them on sweeps for a warped forest and 0 on the Overworld's endermen/);
  assert.match(tree.overworld_hunt.description, /It is day in the Overworld now/);
  assert.match(tree.warped_forest.description, /the two holding no pearl had swept 81 and 33 minutes and hunted endermen 6 and 2\./);
  const task = new Task('pearls');
  task.opportunityClient = { systemOne: async ({ questions }) => ({ answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'overworld_hunt', confidence: 0.6 }])) }) };
  await routes.askRoute(b, task, g, () => {});
  assert.equal(g.pearlRoute.pick, 'overworld');
  assert.ok(g.pearlRoute.until > Date.now());
});
