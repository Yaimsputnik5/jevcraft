'use strict';
// Note 2163: full-1 (2026-10-26 04:45Z) stood 10 blocks across and 100 above its lit Overworld portal, the staircase
// resting, and was offered legs round, the boat again, a portal here and the wait: none good (0.28). The tunnel dug
// toward the portal, the Nether's way home, is a way in the Overworld too where the portal is well below.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const { Task } = require('../src/skills');

function fixture({ dimension, here, portal, rock, pickaxe = true }) {
  const registry = require('minecraft-data')('26.1');
  const items = [{ name: 'cobblestone', count: 64, type: 1 }];
  if (pickaxe) items.push({ name: 'stone_pickaxe', count: 1, type: registry.itemsByName.stone_pickaxe.id });
  const bot = Object.assign(new EventEmitter(), { registry, entity: { position: here, isInWater: false, onGround: true }, game: { dimension, gameMode: 'survival' }, oxygenLevel: 20,
    health: 20, food: 18, entities: {}, world: { raycast: () => null }, time: { timeOfDay: 6000 },
    inventory: { items: () => items, slots: [] },
    findBlocks: () => [],
    blockAt: p => { const f = p.floored(); const name = f.y >= here.y - 1 && f.y <= here.y + 1 && Math.abs(f.x - here.x) <= 1 && Math.abs(f.z - here.z) <= 1 ? (f.y === Math.floor(here.y) - 1 ? rock : 'air') : rock; return { name, boundingBox: name === rock ? 'block' : 'empty', diggable: true, position: f, digTime: () => 600 }; },
    clearControlStates() {}, getControlState() { return false; }, setControlState() {}, stopDigging() {}, canDigBlock: () => true, digTime: () => 600 });
  bot.pathfinder = { movements: {}, setGoal() {}, isMoving: () => false, goto: async () => { throw Object.assign(new Error('No path'), { name: 'NoPath' }); } };
  return bot;
}

test('the Overworld portal far below: the tunnel down to it is offered, priced by stone (full-1, 2026-10-26 04:45Z)', async () => {
  const { portalWay } = require('../src/work');
  const bot = fixture({ dimension: 'overworld', here: new Vec3(330.5, 62, 18.5), portal: { x: 27, y: -51, z: 60 }, rock: 'stone' });
  const task = new Task('portal'), asked = [];
  task.opportunityClient = { systemOne: async ({ questions }) => { asked.push(questions.branch_0.criteria); return { answers: { branch_0: { choice: 'around_left', confidence: 0.9 } } }; } };
  const goal = { survival: {} };
  try { await portalWay(bot, task, goal, () => {}, { x: 320, y: -51, z: 18 }, 'overworld', { walk: 'legs of thirty-two blocks on foot toward it made no ground, and rest two minutes' }); } catch (_) { /* the leg or its rest */ }
  assert.equal(asked.length, 1, 'asked once');
  const options = asked[0];
  assert.ok(options.tunnel_home, `offered: ${Object.keys(options)}`);
  assert.match(options.tunnel_home, /^Dig a tunnel straight at the portal through the rock, two high and one wide: a step down with each block until level with it \(113 below\)/);
  assert.match(options.tunnel_home, /through the Overworld's stone, about 20 blocks a minute with a pickaxe by the game's dig times and the steps between, 4 by hand, which drops no stone/);
  assert.match(options.tunnel_home, /Inside the rock no skeleton has a line to the bot/);
  assert.doesNotMatch(options.tunnel_home, /netherrack/);
});

test('the Overworld portal level with the bot and far across: no tunnel (the walk and the legs round are the ways)', async () => {
  const { portalWay } = require('../src/work');
  const bot = fixture({ dimension: 'overworld', here: new Vec3(330.5, 62, 18.5), portal: { x: 27, y: 60, z: 60 }, rock: 'stone' });
  const task = new Task('portal'), asked = [];
  task.opportunityClient = { systemOne: async ({ questions }) => { asked.push(questions.branch_0.criteria); return { answers: { branch_0: { choice: 'around_left', confidence: 0.9 } } }; } };
  try { await portalWay(bot, task, { survival: {} }, () => {}, { x: 27, y: 60, z: 60 }, 'overworld', { walk: 'the walk made no ground' }); } catch (_) { /* the leg */ }
  assert.equal(asked.length, 1);
  assert.equal(asked[0].tunnel_home, undefined, `offered: ${Object.keys(asked[0])}`);
});
