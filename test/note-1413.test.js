'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const EventEmitter = require('node:events');
const { Task } = require('../src/skills');
const { observeProgress, nextGameStage } = require('../src/game-progress');
const { strategyOptions, strategyStep } = require('../src/strategy');
const { bedFirstSays, bedFirstHolds } = require('../src/bed-first');

// A bot back to life after the Nether, bare: a stone pickaxe and nothing else.
function bare() {
  const items = [{ name: 'stone_pickaxe', count: 1 }, { name: 'string', count: 5 }, { name: 'white_wool', count: 1 }, { name: 'oak_planks', count: 3 }];
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter(), game: { dimension: 'overworld', gameMode: 'survival' },
    health: 20, food: 20, isAlive: true, time: { timeOfDay: 6000 }, entity: { position: new Vec3(.5, 64, .5) }, inventory: { items: () => items, slots: {} },
    entities: { 1: { name: 'sheep', isValid: true, position: new Vec3(10, 64, 0) }, 2: { name: 'sheep', isValid: true, position: new Vec3(90, 64, 0) } } });
  const goal = { version: 1, kind: 'win', request: 'beat the game' };
  observeProgress(bot, goal); bot.game.dimension = 'minecraft:the_nether'; observeProgress(bot, goal); bot.game.dimension = 'overworld';
  return { bot, goal, items };
}

test('with no bed carried, the bed is offered beside the ladder\'s next at win_strategy, with the record and the cost (note 1413)', () => {
  const { bot, goal } = bare();
  const stage = nextGameStage(bot, goal);
  assert.equal(stage.phase, 'stone_sword', 'the ladder\'s next is the sword, the bed behind the kit');
  const options = strategyOptions(bot, goal, stage, {});
  assert.ok(options.rung_bed, Object.keys(options).join(','));
  assert.ok(options.rung_bed.bedFirst);
  assert.match(options.rung_bed.description, /36 were with no bed carried, 21 of them at night/);
  assert.match(options.rung_bed.description, /1 wool and 5 string \(four a wool, 1 more\) carried, 1 wool still to find; 3 planks/);
  assert.match(options.rung_bed.description, /1 sheep in view within 48 blocks/);
  assert.match(options.rung_bed.description, /Night falls in about 5 real minutes/);
  assert.match(bedFirstSays(bot, goal), /20 of 28 bedtimes/);
});

test('chosen, the bed is the ladder\'s next step for an hour, before the tools and the armour, until one is carried', async () => {
  const { bot, goal, items } = bare();
  const stage = nextGameStage(bot, goal);
  let now = Date.now();
  const decide = async (id, args) => ({ path: ['rung_bed'], action: args.tree.rung_bed, stale: false });
  bot.chat = () => {};
  await strategyStep(bot, new Task('win'), goal, () => {}, stage, { decide, now: () => now });
  assert.ok(bedFirstHolds(bot, goal, now), JSON.stringify(goal.bedFirst));
  assert.equal(nextGameStage(bot, goal).phase, 'bed');
  // A bed carried: the kit again.
  items.push({ name: 'white_bed', count: 1 });
  assert.equal(bedFirstHolds(bot, goal, now), false);
  assert.equal(nextGameStage(bot, goal).phase, 'stone_sword');
  items.pop();
  // An hour on, the choice has lapsed.
  assert.equal(bedFirstHolds(bot, goal, now + 61 * 60000), false);
});
