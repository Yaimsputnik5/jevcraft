'use strict';
// Note 1957. A slime or a magma cube is priced as itself in the stance
// figures, not as the family a kill would make of it (as riskNow has it
// since note 1103): the splits were added as thirteen mobs at arm's length
// from the first second, and full-1 (2026-10-20 12:20:40Z, 14.2 health, iron
// sword, two pieces) read one big magma cube as 'about 44.4 damage ... to
// kill the 13 in these figures', the seal at 157, every way past the health
// it had; it chose none that fought, and the cube killed it over eighty
// seconds. In the record magma cubes landed 28 hits in 18 meetings.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { EventEmitter } = require('node:events');
const { Task } = require('../src/skills');
const { Survival } = require('../src/survival');

test('one big magma cube is priced as one mob in the stance figures, its splits said in words (note 1957)', () => {
  const cube = { id: 7, name: 'magma_cube', type: 'hostile', position: new Vec3(3.6, 64, 0.5), height: 2.04, width: 2.04, isValid: true, metadata: Object.assign([], { 16: 4 }) };
  const bot = Object.assign(new EventEmitter(), { game: { dimension: 'the_nether', gameMode: 'survival', difficulty: 'normal' }, health: 14.2, food: 20, oxygenLevel: 20,
    entities: { 7: cube }, time: { timeOfDay: 6000 }, registry: require('minecraft-data')('26.1'),
    entity: { position: new Vec3(0.5, 64, 0.5), onGround: true, width: 0.6, height: 1.8, velocity: new Vec3(0, 0, 0) },
    inventory: { items: () => [{ name: 'iron_sword', count: 1 }, { name: 'cobblestone', count: 64 }], slots: { 45: { name: 'shield' }, 5: { name: 'iron_helmet' }, 6: { name: 'iron_chestplate' } }, emptySlotCount: () => 20 },
    blockAt: p => { const f = p.floored(); const s = f.y < 64; return { position: f, name: s ? 'netherrack' : 'air', boundingBox: s ? 'block' : 'empty', diggable: s }; },
    world: { raycast: () => null }, findBlocks: () => [], lookAt: async () => {}, look: async () => {}, equip: async () => {}, attack() {} });
  const survival = new Survival(bot, { navigate: async () => {}, place: async () => {}, dig: async () => {} }, { state: { shelters: [] } });
  const danger = [{ entity: cube, distance: 3.1, visible: true }];
  const options = survival.stanceOptions(new Task('x'), {}, () => {}, danger, false);
  const fight = options.fight;
  assert.ok(fight, Object.keys(options).join(','));
  assert.ok(fight.expects.damage < 15, `the fight with one cube is priced ${fight.expects.damage}`);
  assert.doesNotMatch(fight.description, /kill the 1[0-9] in these figures/);
  assert.match(fight.description, /splits into/);
  // The seal's price stands on its own terms (the cube is inside the pocket before it shuts); the stances that meet it are one mob's worth.
  for (const k of ['shield_guard', 'pillar', 'run_from']) if (options[k]?.expects && Number.isFinite(options[k].expects.damage)) assert.ok(options[k].expects.damage < 30, `${k} priced ${options[k].expects.damage} against one cube`);
  for (const [k, o] of Object.entries(options)) assert.doesNotMatch(o.description || '', /the 1[0-9] in these figures|13 magma cubes/, k);
});
