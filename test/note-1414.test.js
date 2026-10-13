'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('events'), { Vec3 } = require('vec3');
const registry = require('prismarine-registry')('26.1');
const { Task } = require('../src/skills');
const { fightEndStep, punchRecordSays } = require('../src/end-combat');

// The island at y 64, an obsidian pillar at (20, 64..83, 0) with bedrock on top and the crystal standing on it; no bow, blocks carried.
function fixture(items) {
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter(), registry,
    health: 20, food: 20, oxygenLevel: 20, isAlive: true, game: { gameMode: 'survival', dimension: 'the_end' },
    entity: { position: new Vec3(0.5, 64, 0.5), onGround: true }, entities: {},
    inventory: { items: () => items, slots: {} },
    blockAt: p => {
      const f = p.floored();
      if (f.x === 20 && f.z === 0 && f.y >= 64 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
      if (f.x === 20 && f.z === 0 && f.y === 84) return { name: 'bedrock', boundingBox: 'block', position: f };
      return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f };
    },
    findBlocks: () => [], world: { raycast: () => null }, clearControlStates() {},
    pathfinder: { movements: { blocksCantBreak: new Set([registry.blocksByName.end_stone.id]), scafoldingBlocks: [], canDig: false }, setGoal() {}, getPathTo: () => ({ status: 'success', path: [] }) }
  });
  const dragon = { id: 20, name: 'ender_dragon', position: new Vec3(60, 90, 40), yaw: 0, metadata: {}, isValid: true, width: 2, height: 2 };
  dragon.metadata[registry.entitiesByName.ender_dragon.metadataKeys.indexOf('phase')] = 0;
  dragon.metadata[registry.entitiesByName.ender_dragon.metadataKeys.indexOf('health')] = 200;
  bot.entities[20] = dragon;
  bot.entities[30] = { id: 30, name: 'end_crystal', position: new Vec3(20.5, 85, 0.5), isValid: true, metadata: {}, width: 2, height: 2 };
  return { bot, goal: { kind: 'win', request: 'Jev beat Minecraft', gameProgress: { milestones: {} } }, task: new Task('End') };
}

test('with blocks carried and no shot, the crystal is offered struck by hand from a pillar two under its bedrock, said with the blast\'s record (note 1414)', async () => {
  const { bot, goal, task } = fixture([{ name: 'iron_sword', count: 1, type: registry.itemsByName.iron_sword.id, durabilityUsed: 0 }, { name: 'cobblestone', count: 64 }]);
  let said = null;
  await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async ({ questions }) => { said = questions.branch_0.criteria; return { answers: { branch_0: { choice: 'observe' } } }; } });
  const punch = said?.pillar_punch_30;
  assert.ok(punch, Object.keys(said || {}).join(','));
  assert.equal(punch.blocks, 19, 'a thin pillar: feet two under the bedrock at 84, 83 - 64');
  assert.equal(punch.stance, 'under the bedrock top, beside the pillar');
  assert.equal(punch.blocksOff, 20);
  assert.match(punch.action, /to two under the bedrock the crystal stands on, and strike the crystal from there by hand/);
  assert.match(punch.crystalBlast, /took 11\.8/);
  assert.match(punch.crystalBlast, /from two blocks under the bedrock, beside the pillar, the arena's drill of 2026-10-13 \(05:08Z, full iron, shield raised\) took 0\.4/);
  assert.equal(punch.pillarRadius, 0);
  // Too few blocks: not offered.
  const poor = fixture([{ name: 'iron_sword', count: 1, type: registry.itemsByName.iron_sword.id, durabilityUsed: 0 }, { name: 'cobblestone', count: 8 }]);
  let said2 = null;
  await fightEndStep(poor.bot, poor.task, poor.goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async ({ questions }) => { said2 = questions.branch_0.criteria; return { answers: { branch_0: { choice: 'observe' } } }; } });
  assert.equal(said2?.pillar_punch_30, undefined);
  assert.match(punchRecordSays({ punches: [{ exploded: true, took: 1.5, under: true }] }), /this fight's 1 such blow took 1\.5 health/);
});
