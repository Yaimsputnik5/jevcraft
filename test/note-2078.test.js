'use strict';
// Note 2078. A run from biters at arm's length is priced with the blow each
// lands as the body turns, and a wither skeleton's wither after it, the
// record's median the least of it: full-5 (2026-10-25 01:15:57Z), at 15.8
// in iron, three wither skeletons 2.5 to 3.3 blocks off, was told 1.4 of
// run_from, took four blows and their wither running, and died.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { EventEmitter } = require('node:events');
const { Task } = require('../src/skills');
const { Survival } = require('../src/survival');

const skeleton = (id, x) => ({ id, name: 'wither_skeleton', type: 'hostile', position: new Vec3(x, 64, 0.5), height: 2.4, width: 0.7, isValid: true, heldItem: { name: 'stone_sword' } });
function botAmong(mobs) {
  const bot = Object.assign(new EventEmitter(), { game: { dimension: 'the_nether', gameMode: 'survival', difficulty: 'normal' }, health: 15.8, food: 20, oxygenLevel: 20,
    entities: Object.fromEntries(mobs.map(m => [m.id, m])), time: { timeOfDay: 6000 }, registry: require('minecraft-data')('26.1'),
    entity: { position: new Vec3(0.5, 64, 0.5), onGround: true, width: 0.6, height: 1.8, velocity: new Vec3(0, 0, 0) },
    inventory: { items: () => [{ name: 'iron_sword', count: 1 }, { name: 'cobblestone', count: 64 }], slots: { 45: { name: 'shield' }, 5: { name: 'iron_helmet' }, 6: { name: 'iron_chestplate' }, 7: { name: 'iron_leggings' }, 8: { name: 'golden_boots' } }, emptySlotCount: () => 20 },
    blockAt: p => { const f = p.floored(); const s = f.y < 64; return { position: f, name: s ? 'netherrack' : 'air', boundingBox: s ? 'block' : 'empty', diggable: s }; },
    world: { raycast: () => null }, findBlocks: () => [], lookAt: async () => {}, look: async () => {}, equip: async () => {}, attack() {} });
  return { bot, survival: new Survival(bot, { navigate: async () => {}, place: async () => {}, dig: async () => {} }, { state: { shelters: [] } }) };
}

test('three wither skeletons at arm\'s length: the run is priced with a blow from each as it turns and their wither (note 2078)', () => {
  const mobs = [skeleton(1, 3.0), skeleton(2, 3.5), skeleton(3, 3.8)];
  const { bot, survival } = botAmong(mobs);
  const danger = mobs.map(m => ({ entity: m, distance: m.position.distanceTo(bot.entity.position), visible: true }));
  const run = survival.stanceOptions(new Task('x'), {}, () => {}, danger, false).run_from;
  assert.ok(run, 'run_from offered');
  assert.ok(run.expects.damage >= 12, `priced ${run.expects.damage}`);
  assert.match(run.description, /At arm's length now: 3 that bite, each with about a blow as the run turns and gets up to a sprint, about [\d.]+ through the armour worn, and its wither after, about 5 more over ten seconds that armour does not stop\./);
});

test('one wither skeleton seven blocks off: no turn blows, the record\'s median stands (note 2078)', () => {
  const mobs = [skeleton(1, 7.5)];
  const { bot, survival } = botAmong(mobs);
  const danger = mobs.map(m => ({ entity: m, distance: m.position.distanceTo(bot.entity.position), visible: true }));
  const run = survival.stanceOptions(new Task('x'), {}, () => {}, danger, false).run_from;
  assert.ok(run, 'run_from offered');
  assert.doesNotMatch(run.description, /At arm's length now/);
  assert.ok(run.expects.damage < 5, `priced ${run.expects.damage}`);
});
