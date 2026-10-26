'use strict';
// Note 2143: win_strategy's state says how far the goal's eyes are (rods,
// pearls, eyes carried and in chests, what is still needed).
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const { strategyStep } = require('../src/strategy');
const { Task } = require('../src/skills');

test('the goal\'s eyes said on the strategy question once the Nether has been entered', async () => {
  const items = ['white_bed', 'diamond_pickaxe', 'iron_sword', 'shield', 'water_bucket', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'golden_boots', 'bow'].map(name => ({ name, count: 1 })).concat({ name: 'arrow', count: 16 }, { name: 'blaze_rod', count: 2 }, { name: 'ender_pearl', count: 5 });
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter(), game: { dimension: 'overworld', gameMode: 'survival' }, registry: require('minecraft-data')('26.1'),
    health: 20, food: 20, isAlive: true, entities: {}, time: { timeOfDay: 1000 }, entity: { position: new Vec3(.5, 64, .5) }, inventory: { items: () => items, slots: {} } });
  const goal = { version: 1, kind: 'win', request: 'beat the game', survival: {}, gameProgress: { milestones: { nether_entered: { at: 1 } } } };
  const asked = [];
  const decide = async (id, args) => { asked.push({ id, state: args.state }); return { path: ['rung_diamond_sword'] }; };
  const stage = { phase: 'diamond_sword', action: 'acquire', item: 'diamond_sword', count: 1 };
  goal.rungOptIn = { diamond_sword: Date.now() };
  await strategyStep(bot, new Task('win'), goal, () => {}, stage, { decide });
  assert.ok(asked.length, 'asked');
  assert.match(asked[0].state.goalStill, /^The goal wants 7 blaze rods in all for 13 eyes \(.*\)\. Carried: 2 blaze rods, 5 ender pearls; 5 rods still needed\.$/);
});

test('past the eyes, the goal still is the End and the dragon, not zero rods (note 2151)', async () => {
  const items = ['white_bed', 'diamond_pickaxe', 'iron_sword', 'diamond_sword', 'shield', 'water_bucket', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'golden_boots', 'fishing_rod'].map(name => ({ name, count: 1 })).concat({ name: 'arrow', count: 16 }, { name: 'string', count: 3 });
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter(), game: { dimension: 'overworld', gameMode: 'survival' }, registry: require('minecraft-data')('26.1'),
    health: 20, food: 20, isAlive: true, entities: {}, time: { timeOfDay: 1000 }, entity: { position: new Vec3(1540.5, 66, 1122.5) }, inventory: { items: () => items, slots: {} }, blockAt: () => null });
  const frames = Array.from({ length: 12 }, (_, i) => ({ position: { x: 2050 + (i % 4), y: 42, z: 1509 + Math.floor(i / 4) }, eye: true }));
  const goal = { version: 1, kind: 'win', request: 'beat the game', survival: {}, rungOptIn: { bow: Date.now() },
    gameProgress: { milestones: { nether_entered: { at: 1 }, eyes_obtained: { at: 2 }, stronghold_located: { at: 3, center: { x: 2052, y: 42, z: 1511 } }, end_entered: { at: 4 } } },
    endPortal: { center: { x: 2052, y: 42, z: 1511 }, frames, neededEyes: 0, litAt: '2026-10-26T00:00:00.000Z' } };
  const asked = [];
  const decide = async (id, args) => { asked.push({ id, state: args.state }); return { path: ['rung_bow'] }; };
  await strategyStep(bot, new Task('win'), goal, () => {}, { phase: 'bow', action: 'acquire', item: 'bow', count: 1 }, { decide });
  assert.equal(asked[0].state.goalStill, "The End portal's frames are all filled: no blaze rod or ender pearl is wanted any more; what is left of the goal is the End and the dragon, the ring at (2052, 42, 1511).");
});
