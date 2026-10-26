'use strict';
// Note 2127: the drops the dying client saw are said kit first and the
// cheap last, with the rest counted by name; and under 100 blocks go_back
// says the walk's seconds against the seconds the drops have left.
const test = require('node:test');
const assert = require('node:assert');
const { dropsSeenSays, byRank } = require('../src/corpse-run');

test('byRank puts the goal and the kit before worth-while things and the cheap last', () => {
  const names = byRank([{ name: 'cobblestone' }, { name: 'raw_iron' }, { name: 'dirt' }, { name: 'diamond_pickaxe' }, { name: 'iron_chestplate' }, { name: 'blaze_rod' }, { name: 'stone_pickaxe' }]).map(d => d.name);
  assert.deepEqual(names, ['blaze_rod', 'diamond_pickaxe', 'iron_chestplate', 'raw_iron', 'cobblestone', 'dirt', 'stone_pickaxe']);
});

test('the drops seen are said kit first, the rest counted by name', () => {
  const drops = [];
  for (let i = 0; i < 9; i++) drops.push({ name: 'cobblestone', count: 2, x: 46 + i, y: 39, z: 175 });
  drops.push({ name: 'dirt', count: 1, x: 46, y: 39, z: 173 }, { name: 'diamond_pickaxe', count: 1, x: 42, y: 37, z: 170 }, { name: 'iron_helmet', count: 1, x: 43, y: 37, z: 170 });
  const said = dropsSeenSays({ position: { x: 42, y: 37, z: 170 }, drops });
  assert.match(said, /^ As it died the bot saw 12 stacks of its drops lying within 13 blocks of the death cell: diamond pickaxe at \(42, 37, 170\), iron helmet at \(43, 37, 170\), 2 cobblestone/);
  assert.match(said, /, and 6 more stacks of cobblestone, dirt; the walk back searches there\.$/);
});

test('go_back under 100 blocks says the walk\'s seconds against the seconds left', async () => {
  const { Vec3 } = require('vec3');
  const { Task } = require('../src/skills');
  const { corpseRun, corpseRunStep } = require('../src/corpse-run');
  const deathAt = new Date(Date.now() - 20000).toISOString();
  const bot = { game: { dimension: 'overworld' }, entity: { position: new Vec3(0, 10, 0) }, chat: () => {}, registry: require('minecraft-data')('26.1'), time: { timeOfDay: 2000 }, inventory: { items: () => [], slots: {} }, entities: {} };
  const goal = { survival: { deaths: [{ at: deathAt, position: { x: 44, y: 37, z: 0 }, dimension: 'overworld', cause: 'was killed by Witch using magic', worn: ['iron_helmet'] }],
    recovery: { at: deathAt, status: 'finished', recovered: {}, inventoryBeforeDeath: { diamond_pickaxe: 1, iron_helmet: 1 }, dropsSeen: [] } } };
  corpseRun(bot, goal).loadedAt = deathAt;
  let text = '';
  await corpseRunStep(bot, Object.assign(new Task('run'), { opportunityClient: { systemOne: async ({ questions }) => { text = JSON.stringify(Object.values(questions)[0]); return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'leave_them', confidence: 0.9 }])) }; } } }), goal, () => {}, { move: async () => {}, collect: async () => false });
  assert.match(text, /52 blocks off, at y 37\. About 2[78]\d seconds before they vanish\. The way there is about \d+ seconds of them, at the pace the bot's walks and climbs have made, stalls counted\./);
});
