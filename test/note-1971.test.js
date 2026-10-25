'use strict';
// Note 1971: keep_working was the one stance left unpriced. With every mob
// about stood off it is priced as the hold is, at what they have done.
// full-4 (2026-10-20 17:47 to 18:05Z) held a pillar eighteen minutes
// against two zombies said to be "not a threat that stops the work".
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { EventEmitter } = require('node:events');
const { Task } = require('../src/skills');
const registry = require('minecraft-data')('26.1');

function stanceBot() {
  const here = new Vec3(0, 64, 0);
  const zombie = { id: 3, name: 'zombie', type: 'hostile', position: here.offset(-6, 0, 0), height: 1.95, width: 0.6, isValid: true, metadata: [0] };
  const items = [{ name: 'stone_sword', count: 1 }, { name: 'cobblestone', count: 60 }];
  const bot = Object.assign(new EventEmitter(), { game: { dimension: 'overworld', gameMode: 'survival', difficulty: 'normal' }, health: 20, food: 20, oxygenLevel: 20,
    entity: { position: here, onGround: true, height: 1.8, width: 0.6, velocity: new Vec3(0, 0, 0), metadata: [0] }, entities: { 3: zombie }, time: { timeOfDay: 18000 },
    inventory: { items: () => items, slots: { 5: { name: 'iron_helmet' }, 6: { name: 'iron_chestplate' } } },
    world: { raycast: () => null }, blockAt: p => (p.y < 64 ? { name: 'stone', boundingBox: 'block', position: p } : { name: 'air', boundingBox: 'empty', position: p }), registry,
    pathfinder: { movements: {}, setGoal() {}, getPathTo: () => ({ status: 'noPath', path: [] }) }, clearControlStates() {}, setControlState() {}, getControlState: () => false,
    activateItem() {}, deactivateItem() {}, lookAt: async () => {}, look: async () => {}, equip: async () => {}, attack: () => {}, findBlocks: () => [] });
  return { bot, zombie };
}

test('keep_working is priced at nothing when every mob about has stood off, and left unpriced otherwise (full-4 2026-10-20 18:01Z, note 1971)', t => {
  const { Survival } = require('../src/survival');
  const danger = require('../src/danger');
  const { bot, zombie } = stanceBot();
  const survival = new Survival(bot, { place: async () => {}, dig: async () => {}, navigate: async () => {} }, { state: { shelters: [] } });
  const list = [{ entity: zombie, distance: 6, visible: true }];
  const off = t.mock.method(danger, 'standsOff', () => ({ seconds: 399, nearest: 5.6, farthest: 5.8, inSight: true }));
  let options = survival.stanceOptions(new Task('x'), {}, () => {}, list, false);
  assert.ok(options.keep_working, Object.keys(options).join(','));
  assert.deepEqual({ damage: options.keep_working.expects?.damage, seconds: options.keep_working.expects?.seconds }, { damage: 0, seconds: 15 });
  off.mock.mockImplementation(() => null);
  options = survival.stanceOptions(new Task('x'), {}, () => {}, list, false);
  assert.ok(options.keep_working);
  // A zombie that has not stood off: its first blow as it comes, within the fifteen seconds (note 2097).
  assert.ok(options.keep_working.expects?.damage > 0, JSON.stringify(options.keep_working.expects));
});
