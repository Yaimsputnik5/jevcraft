'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { Task } = require('../src/skills');
const { deepBeside, dodgeRoutes, evadeOverTerrain, straightAway } = require('../src/end-safety');
const registry = require('prismarine-registry')('26.1');

// The End's entry platform: obsidian five blocks square at y 48, x 98 to 102, z -2 to 2, nothing under or about it.
function platform(at = new Vec3(98.5, 49, 0.5)) {
  const phase = registry.entitiesByName.ender_dragon.metadataKeys.indexOf('phase');
  const dragon = { id: 20, name: 'ender_dragon', position: new Vec3(60, 60, 0.5), metadata: { [phase]: 8 } };
  const on = p => p.y === 48 && p.x >= 98 && p.x <= 102 && p.z >= -2 && p.z <= 2;
  const bot = { registry, game: { dimension: 'the_end' }, health: 20, isAlive: true, entity: { position: at, onGround: true }, entities: { 20: dragon },
    blockAt: p => { const f = p.floored(); return on(f) ? { name: 'obsidian', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' }; },
    pathfinder: { setGoal() {}, movements: { canDig: true, maxDropDown: 3, allowSprinting: false, allow1by1towers: true, scafoldingBlocks: [1] }, getPathTo: (m, dest) => ({ status: 'success', path: [{ x: dest.x, y: dest.y, z: dest.z, toBreak: [] }] }) },
    clearControlStates() {}, setControlState() {}, look: async () => {}, emit() {} };
  return { bot, dragon };
}

test('on the entry platform over the void, no dodge is taken to a cell at its edge: the fight stands rather than runs off it (note 1153)', async () => {
  const { bot, dragon } = platform();
  assert.equal(deepBeside(bot, new Vec3(102.5, 49, -1.5)), true, 'the corner cell the rehearsal ran to');
  assert.equal(deepBeside(bot, new Vec3(100.5, 49, 0.5)), false, 'the platform\'s middle');
  let walked = null;
  await assert.rejects(evadeOverTerrain(bot, new Task('dodge'), { endCombat: {} }, () => {}, dragon, { walk: async (b, t, dest) => { walked = dest; } }), { name: 'NoEscape' });
  assert.equal(walked, null, 'no walk to an edge cell');
  for (const r of dodgeRoutes(bot, dragon)) assert.equal(deepBeside(bot, r.destination), false, `a run ending at ${r.destination}`);
  assert.equal(straightAway(bot, bot.entity.position, 0), null);
});

test('on the island\'s open ground the dodges are as they were', () => {
  const { bot, dragon } = platform(new Vec3(0.5, 64, 0.5));
  bot.blockAt = p => ({ name: p.y < 64 ? 'end_stone' : 'air', boundingBox: p.y < 64 ? 'block' : 'empty' });
  assert.equal(deepBeside(bot, bot.entity.position), false);
  const routes = dodgeRoutes(bot, dragon);
  assert.equal(routes.length, 3);
  assert.ok(routes.every(r => r.distance === 8));
  assert.ok(straightAway(bot, bot.entity.position, 0));
});

test('from the dragon\'s breath on the ground the dodge is straight out of it first, not along its ring (note 1162)', () => {
  const { bot } = platform(new Vec3(0.5, 64, 0.5));
  bot.blockAt = p => ({ name: p.y < 64 ? 'end_stone' : 'air', boundingBox: p.y < 64 ? 'block' : 'empty' });
  const cloud = { id: 21, name: 'area_effect_cloud', position: new Vec3(2.5, 64, 0.5), metadata: {} };
  const routes = dodgeRoutes(bot, cloud);
  assert.ok(routes[0].direction.x < -0.99, `first ${routes[0].direction}`);
  assert.ok(Math.abs(routes[0].direction.z) < 0.01);
  // From the dragon itself the first is still sideways.
  const dragon = { id: 20, name: 'ender_dragon', position: new Vec3(20.5, 66, 0.5), metadata: {} };
  assert.ok(Math.abs(dodgeRoutes(bot, dragon)[0].direction.z) > 0.99);
});

test('in the breath on a one-wide bridge over the void, the escape walks along the bridge out of the cloud (note 1404)', async () => {
  const { bot } = platform(new Vec3(91.5, 49, 0.5));
  // A bridge at y 48 along z 0.5 from x 80 to the platform; the cloud at the bot's feet.
  const cloud = { id: 30, name: 'area_effect_cloud', position: new Vec3(91.5, 49, 0.5), metadata: {} };
  bot.entities = { 30: cloud };
  bot.blockAt = p => { const f = p.floored(); return f.y === 48 && f.z === 0 && f.x >= 80 && f.x <= 102 ? { name: 'cobblestone', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' }; };
  let walked = null;
  const goal = { endCombat: {} };
  assert.equal(await evadeOverTerrain(bot, new Task('dodge'), goal, () => {}, cloud, { walk: async (b, t, dest) => { walked = dest; } }), true);
  assert.equal(walked.z, 0);
  assert.ok(Math.abs(walked.x - 91) > 3, `walked out of the cloud's radius of 3: ${walked.x}`);
  assert.equal(goal.step.action, 'evade_dragon_over_terrain');
});

test('in the breath on open ground the escape runs straight out first, no survey (note 1423)', async () => {
  const { evadeDragon } = require('../src/end-safety');
  const { bot } = platform(new Vec3(0.5, 64, 0.5));
  bot.blockAt = p => ({ name: p.y < 64 ? 'end_stone' : 'air', boundingBox: p.y < 64 ? 'block' : 'empty' });
  bot.entities = { 30: { id: 30, name: 'area_effect_cloud', position: new Vec3(0.5, 64, 0.5), metadata: {}, isValid: true } };
  bot.look = async () => {}; bot.lookAt = async () => {}; bot.setControlState = () => {}; bot.clearControlStates = () => {};
  const goal = { endCombat: {} }, steps = [];
  let surveysBeforeRun = null;
  const surveyed = [];
  bot.pathfinder.getPathTo = (...a) => { surveyed.push(a); return { status: 'noPath', path: [] }; };
  const save = () => { steps.push(goal.step?.action); if (goal.step?.action === 'evade_breath_straight' && surveysBeforeRun === null) surveysBeforeRun = surveyed.length; };
  // The stub bot does not move, so the run gains nothing and the surveys follow it.
  try { await evadeDragon(bot, new Task('dodge'), goal, save, { timeoutMs: 300 }); } catch (err) { assert.equal(err.name, 'NoEscape'); }
  assert.equal(steps[0], 'evade_breath_straight', steps.join(','));
  assert.equal(surveysBeforeRun, 0, 'no route survey before the straight run');
});

test('the straight run out of the breath takes no slope steeper than a block a cell: down a slope the body is in the air past its stop (note 1436)', () => {
  const { bot } = platform(new Vec3(0.5, 64, 0.5));
  // Level ground west of x 0 at y 64; east of it the ground steps down two a cell, to the rim at x 6.
  bot.blockAt = p => { const f = p.floored(); const top = f.x < 0 ? 63 : f.x <= 5 ? 63 - 2 * f.x : -100; return { name: f.y <= top ? 'end_stone' : 'air', boundingBox: f.y <= top ? 'block' : 'empty' }; };
  // The cloud to the west: straight out is east, down the slope.
  const away = straightAway(bot, bot.entity.position, Math.PI, () => true, 6);
  assert.ok(away, 'a run is found');
  assert.ok(away.x - 0.5 < 1, `not down the slope: ${away}`);
  // One down a cell is walked.
  bot.blockAt = p => { const f = p.floored(); const top = f.x < 0 ? 63 : 63 - f.x; return { name: f.y <= top ? 'end_stone' : 'air', boundingBox: f.y <= top ? 'block' : 'empty' }; };
  const gentle = straightAway(bot, bot.entity.position, Math.PI, () => true, 6);
  assert.ok(gentle && gentle.x > 5, `down a gentle slope: ${gentle}`);
});
