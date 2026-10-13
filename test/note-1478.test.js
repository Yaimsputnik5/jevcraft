'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('events'), { Vec3 } = require('vec3');
const registry = require('prismarine-registry')('26.1');
const { Task } = require('../src/skills');
const { fightEndStep } = require('../src/end-combat');

// On its own cobblestone column at (0, 0), feet at 76 over the island at 64; a crystal's obsidian far off; the dragon low and near (a pass to hold through).
function fixture() {
  const removed = new Set();
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter(), registry,
    health: 20, food: 20, oxygenLevel: 20, isAlive: true, game: { gameMode: 'survival', dimension: 'the_end' },
    entity: { position: new Vec3(0.5, 76, 0.5), onGround: true }, entities: {},
    inventory: { items: () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }], slots: {} },
    _pillarUp: { x: 0, z: 0, until: Date.now() + 600000 },
    blockAt: p => {
      const f = p.floored(), k = `${f.x},${f.y},${f.z}`;
      if (removed.has(k)) return { name: 'air', boundingBox: 'empty', position: f };
      if (f.x === 0 && f.z === 0 && f.y >= 64 && f.y < 76) return { name: 'cobblestone', boundingBox: 'block', position: f };
      if (f.x === 20 && f.z === 0 && f.y >= 64 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
      return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f };
    },
    findBlocks: () => [], world: { raycast: () => null }, clearControlStates() {}, setControlState() {}, lookAt: async () => {}, equip: async () => {}, placeBlock: async () => { throw Object.assign(new Error('no face'), { name: 'NoFace' }); }, activateItem() {}, deactivateItem() {},
    pathfinder: { movements: { blocksCantBreak: new Set([registry.blocksByName.end_stone.id]), scafoldingBlocks: [], canDig: false }, setGoal() {}, getPathTo: () => ({ status: 'success', path: [] }) }
  });
  const dragon = { id: 20, name: 'ender_dragon', position: new Vec3(8, 80, 0), yaw: 0, metadata: {}, isValid: true, width: 2, height: 2 };
  dragon.metadata[registry.entitiesByName.ender_dragon.metadataKeys.indexOf('phase')] = 0;
  dragon.metadata[registry.entitiesByName.ender_dragon.metadataKeys.indexOf('health')] = 200;
  bot.entities[20] = dragon;
  bot.entities[30] = { id: 30, name: 'end_crystal', position: new Vec3(20.5, 85, 0.5), isValid: true, metadata: {}, width: 2, height: 2 };
  const dug = [];
  const dig = async (b, t, pos) => { dug.push(pos.clone()); removed.add(`${pos.x},${pos.y},${pos.z}`); bot.entity.position = new Vec3(0.5, pos.y, 0.5); };
  return { bot, removed, dug, dig, goal: { kind: 'win', request: 'Jev beat Minecraft', gameProgress: { milestones: {} } }, task: new Task('End') };
}

test('the hold on the column lets go the moment the breath is at the feet, and the way down begins (note 1478)', async () => {
  const { bot, dug, dig, goal, task } = fixture();
  const steps = [];
  const save = () => { if (goal.step) steps.push(goal.step.action); };
  // The cloud comes to the feet 250 ms into the hold, and the health drops with it.
  setTimeout(() => {
    const cloud = { id: 40, name: 'area_effect_cloud', position: new Vec3(0.5, 76, 0.5), isValid: true, metadata: {} };
    cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
    bot.entities[40] = cloud; bot.health = 14.6;
  }, 250);
  const t0 = Date.now();
  await fightEndStep(bot, task, goal, save, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) });
  assert.ok(steps.includes('hold_on_pillar'), steps.join(','));
  assert.ok(steps.includes('down_out_of_breath'), steps.join(','));
  assert.ok(dug.length >= 2, `dug ${dug.length}: ${dug.map(String).join(' ')}`);
  assert.ok(Date.now() - t0 < 1400, `the hold was not held to its end: ${Date.now() - t0} ms`);
});

test('the hold with no breath is held to its end, nothing dug (note 1478)', async () => {
  const { bot, dug, dig, goal, task } = fixture();
  const steps = [];
  const save = () => { if (goal.step) steps.push(goal.step.action); };
  await fightEndStep(bot, task, goal, save, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) });
  assert.ok(steps.includes('hold_on_pillar'), steps.join(','));
  assert.equal(dug.length, 0, dug.map(String).join(' '));
});

test('on its column the bot is kept crouched through the step, so no push takes it off the edge (note 1478, 1480)', async () => {
  const { bot, goal, task, dig } = fixture();
  bot.entities[20].position = new (require('vec3').Vec3)(80, 90, 80); // the dragon far: no hold, the question asked
  const set = [];
  bot.controlState = {};
  bot.setControlState = (k, v) => { set.push([k, v]); bot.controlState[k] = v; };
  await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async () => { await new Promise(r => setTimeout(r, 200)); return { answers: { branch_0: { choice: 'observe' } } }; } });
  assert.ok(set.some(([k, v]) => k === 'sneak' && v === true), JSON.stringify(set));
});

test('a column with obsidian on two sides and the roof post on a third is still the bot\'s own pillar (note 1482)', async () => {
  const { bot, goal, task, dig } = fixture();
  const solid = new Set(['1,75,0', '0,75,1', '-1,75,0', '-1,76,0', '-1,77,0', '-1,78,0']);
  const was = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (solid.has(`${f.x},${f.y},${f.z}`)) return { name: f.x === -1 ? 'end_stone' : 'obsidian', boundingBox: 'block', position: f }; return was(p); };
  const steps = [];
  const save = () => { if (goal.step) steps.push(goal.step.action); };
  await fightEndStep(bot, task, goal, save, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) });
  assert.ok(steps.includes('hold_on_pillar'), steps.join(','));
});
