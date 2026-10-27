'use strict';
// Note 2269: what holds for every way of corpse_run (the drops seen, the record of walks back) is said once in its state.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { Task } = require('../src/skills');
const { corpseRunStep } = require('../src/corpse-run');

test('corpse_run: the record of walks back is in the state, not on each way', async () => {
  const deathAt = new Date(Date.now() - 60000).toISOString();
  const bot = { game: { dimension: 'overworld' }, entity: { position: new Vec3(0, 64, 0) }, chat: () => {}, registry: require('minecraft-data')('26.1'), time: { timeOfDay: 1000 }, inventory: { items: () => [], slots: {} } };
  const goal = { survival: { deaths: [{ at: deathAt, position: { x: 400, y: 64, z: 0 }, dimension: 'overworld' }],
    recovery: { at: deathAt, status: 'finished', recovered: {}, inventoryBeforeDeath: { iron_chestplate: 1, diamond_sword: 1, blaze_rod: 8 } } } };
  let asked = null;
  const client = { systemOne: async ({ state, questions }) => { asked = { state, criteria: Object.values(questions)[0].criteria }; return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'leave_them', confidence: 0.9 }])) }; } };
  const task = Object.assign(new Task('run'), { opportunityClient: client });
  await corpseRunStep(bot, task, goal, () => {}, { move: async () => {} });
  assert.match(JSON.stringify(asked.state), /walks back set out/);
  for (const [k, d] of Object.entries(asked.criteria)) assert.doesNotMatch(d, /walks back set out/, `${k} does not carry the record`);
});
