'use strict';
// The four full runs (2026-10-22): no home chest by the bed they came back to life at; 8, 7, 5 and 4 of their last
// ten deaths in no armour (note 2029).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const registry = require('prismarine-registry')('26.1');

function fixture({ chestAt = null } = {}) {
  const items = [{ name: 'iron_chestplate', count: 1 }, { name: 'iron_sword', count: 1 }, { name: 'stone_sword', count: 1 }, { name: 'oak_planks', count: 12 }];
  const slots = []; slots[6] = { name: 'iron_chestplate', count: 1 };
  const blocks = {};
  const solid = { name: 'stone', boundingBox: 'block' }, air = { name: 'air', boundingBox: 'empty' };
  const bot = { registry, game: { dimension: 'overworld', gameMode: 'survival' }, entity: { position: new Vec3(701.5, 103, 294.5) },
    inventory: { items: () => items, slots },
    _survivalState: { spawnBed: { foot: { x: 700, y: 103, z: 293 }, head: { x: 701, y: 103, z: 293 } }, deaths: [] },
    blockAt: p => blocks[`${p.x},${p.y},${p.z}`] || (p.y < 103 ? solid : p.y === 103 && ((p.x === 700 || p.x === 701) && p.z === 293) ? { name: 'black_bed', boundingBox: 'block' } : air) };
  if (chestAt) blocks[chestAt] = { name: 'chest', boundingBox: 'block' };
  return { bot, blocks, goal: { kind: 'win', survival: {} } };
}

test('beside the bed slept in, with spare armour and no home chest there, a chest for the kit is offered, and goes on open ground beside the bed', async () => {
  const { bedKitChores, bedKitHome, chestCell } = require('../src/bed-kit');
  const { bot, blocks, goal } = fixture();
  const chores = bedKitChores(bot, goal);
  assert.ok(chores.kit_by_bed, `offered: ${Object.keys(chores)}`);
  assert.match(chores.kit_by_bed.description, /^Put a chest \(eight planks\) beside the bed slept in, \d+ blocks off, and leave in it .*iron chestplate/);
  const cell = chestCell(bot, bot._survivalState.spawnBed.foot, bot._survivalState.spawnBed.head);
  assert.ok(cell && cell.y === 103 && !((cell.x === 700 || cell.x === 701) && cell.z === 293));
  // A home base's chest by the bed: none of this.
  goal.survival.home = { stash: { position: { x: 702, y: 103, z: 293 } } };
  assert.equal(bedKitHome(bot, goal), null);
  delete goal.survival.home;
  // Far from the bed: not offered.
  bot.entity.position = new Vec3(760, 103, 294);
  assert.deepEqual(bedKitChores(bot, goal), {});
  // A chest down: stocking and taking out are offered by what it holds.
  bot.entity.position = new Vec3(701.5, 103, 294.5);
  goal.bedKit = { position: { x: 699, y: 103, z: 293 }, bedFoot: { x: 700, y: 103, z: 293 }, contents: { iron_helmet: 1 } };
  blocks['699,103,293'] = { name: 'chest', boundingBox: 'block' };
  const again = bedKitChores(bot, goal);
  assert.ok(again.stock_bed_kit, `offered: ${Object.keys(again)}`);
  // A new bed slept in elsewhere: the old chest is left behind.
  bot._survivalState.spawnBed = { foot: { x: 900, y: 70, z: 900 } };
  bedKitHome(bot, goal);
  assert.equal(goal.bedKit, undefined);
});

// full-1 (2026-10-22 11:02:50Z): acquireStep is a step a call; one call left no chest, 'Need more chest' (note 2030).
test('the chest beside the bed is made over as many steps as its plan takes, then placed', async () => {
  const { bedKitChores } = require('../src/bed-kit');
  const { bot, blocks, goal } = fixture();
  const items = bot.inventory.items();
  let calls = 0;
  const actions = {
    acquireStep: async () => { calls++; if (calls === 3) items.push({ name: 'chest', count: 1 }); return calls === 3; },
    navigate: async () => {}, place: async (b, t, cell) => { blocks[`${cell.x},${cell.y},${cell.z}`] = { name: 'chest', boundingBox: 'block' }; },
  };
  const task = { check: () => {} };
  // The stocking after the placing is the home stash's; only the placing is checked here.
  require('../src/home-stash').stockStash = async () => [];
  await bedKitChores(bot, goal).kit_by_bed.run(bot, task, goal, () => {}, actions);
  assert.equal(calls, 3);
  assert.ok(goal.bedKit?.position, 'placed and remembered');
});
