'use strict';
// Note 2148: at a respawn with nothing carried, arms first (a stone sword,
// a shield where an ingot is carried) is on the corpse-run question; chosen,
// the arms are made a pass at a time, then the walk back as go_back says.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { Task } = require('../src/skills');
const { corpseRun, corpseRunStep, armsFirstWant } = require('../src/corpse-run');

function world(items) {
  const deathAt = new Date(Date.now() - 20000).toISOString();
  const bot = { game: { dimension: 'overworld' }, entity: { position: new Vec3(0, 64, 0) }, chat: () => {}, registry: require('minecraft-data')('26.1'), time: { timeOfDay: 2000 }, inventory: { items: () => items, slots: {} }, entities: {} };
  const goal = { survival: { deaths: [{ at: deathAt, position: { x: 400, y: 64, z: 0 }, dimension: 'overworld', cause: 'was slain by Zombie', worn: ['iron_helmet'] }],
    recovery: { at: deathAt, status: 'finished', recovered: {}, inventoryBeforeDeath: { diamond_pickaxe: 1, iron_helmet: 1 }, dropsSeen: [] } } };
  return { bot, goal };
}

test('the arms wanted: a stone sword without a sword or axe, a shield with an ingot', () => {
  assert.deepEqual(armsFirstWant({ inventory: { items: () => [], slots: {} } }), ['stone_sword']);
  assert.deepEqual(armsFirstWant({ inventory: { items: () => [{ name: 'iron_ingot', count: 1 }], slots: {} } }), ['stone_sword', 'shield']);
  assert.deepEqual(armsFirstWant({ inventory: { items: () => [{ name: 'stone_axe', count: 1 }, { name: 'shield', count: 1 }], slots: {} } }), []);
});

test('arm_first is offered bare and, chosen, makes the sword before the walk', async () => {
  const items = [{ name: 'cobblestone', count: 5 }, { name: 'stick', count: 2 }];
  const { bot, goal } = world(items);
  assert.ok(corpseRun(bot, goal));
  let text = ''; const made = [];
  const client = { systemOne: async ({ questions }) => { text = JSON.stringify(Object.values(questions)[0]); return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'arm_first', confidence: 0.8 }])) }; } };
  const arm = async (b, t, item) => { made.push(item); items.push({ name: item, count: 1 }); };
  const task = Object.assign(new Task('run'), { opportunityClient: client });
  assert.equal(await corpseRunStep(bot, task, goal, () => {}, { move: async () => {}, collect: async () => false, arm }), true);
  assert.match(text, /"arm_first":"Make stone sword here first, then set out for them as go back says: a stone sword is two cobblestone and a stick \(5 cobblestone, 2 sticks, 0 planks, 0 logs carried\), a few seconds at a crafting table \(four planks make one\); about two or three minutes with the gathering\. The bot goes to them with no sword or axe and no armour now\. The drops do not age meanwhile\. Ten minutes at most on the arms; then the walk with what there is\./);
  assert.deepEqual(made, ['stone_sword']);
  assert.equal(goal.corpseRun.choice, 'go_back');
  // The sword carried: the next pass walks.
  let walked = false;
  await corpseRunStep(bot, task, goal, () => {}, { move: async () => { walked = true; }, collect: async () => false, arm });
  assert.ok(walked, 'the walk back follows');
});
