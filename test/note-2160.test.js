'use strict';
// A pickaxe rung alone before the Nether, a pickaxe carried: the Nether now is a route (note 2160).
const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { Vec3 } = require('vec3');
const { strategyOptions } = require('../src/strategy');
const { openRungs } = require('../src/game-progress');

const GEAR = ['white_bed', 'iron_sword', 'shield', 'water_bucket', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'golden_boots', 'bow'].map(name => ({ name, count: 1 })).concat({ name: 'arrow', count: 16 });
function fixture(items) {
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter(), game: { dimension: 'overworld', gameMode: 'survival' }, registry: { itemsByName: { stone_pickaxe: { maxDurability: 131 }, iron_pickaxe: { maxDurability: 250 } } },
    health: 20, food: 20, isAlive: true, entities: {}, time: { timeOfDay: 1000 }, entity: { position: new Vec3(.5, 64, .5) }, inventory: { items: () => items, slots: [] } });
  return { bot, goal: { version: 1, kind: 'win', request: 'beat the game' } };
}

test('the iron pickaxe rung with a stone pickaxe carried offers the Nether now, priced by the pickaxes carried (full-1, 2026-10-26 06:06Z: none good 0.64 with the rung and its stage alone)', () => {
  const { bot, goal } = fixture([...GEAR, { name: 'stone_pickaxe', count: 1, durabilityUsed: 20 }, { name: 'cobblestone', count: 64 }, { name: 'stick', count: 1 }, { name: 'iron_ingot', count: 1 }]);
  const rungs = openRungs(bot, goal);
  assert.equal(rungs[0]?.phase, 'iron_pickaxe', `rungs: ${rungs.map(r => r.phase)}`);
  const stage = { phase: 'iron_pickaxe', action: 'acquire', item: 'iron_pickaxe', count: 1 };
  const options = strategyOptions(bot, goal, stage, {});
  assert.ok(options.nether_first, `offered: ${Object.keys(options)}`);
  assert.match(options.nether_first.description, /the pickaxes carried are stone pickaxe \(111 uses left\); the Nether has no stone or iron ore for another, so one worn out there is made again only from what is carried \(64 cobblestone, 1 iron ingots, 1 sticks' worth of wood\): about 0 stone pickaxes and 0 iron/);
});

test('with no pickaxe carried the pickaxe rung stands alone: no Nether now', () => {
  const { bot, goal } = fixture([...GEAR, { name: 'cobblestone', count: 64 }]);
  const rungs = openRungs(bot, goal);
  assert.ok(rungs.length && /pickaxe$/.test(rungs[0].phase), `rungs: ${rungs.map(r => r.phase)}`);
  const stage = { phase: rungs[0].phase, action: 'acquire', item: rungs[0].phase, count: 1 };
  assert.equal(strategyOptions(bot, goal, stage, {}).nether_first, undefined);
});
