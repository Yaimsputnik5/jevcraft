'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const registry = require('prismarine-registry')('26.1');
const { Task } = require('../src/skills');
const { prepareEndSupplies, kitItems } = require('../src/end-supplies');
function fixture() {
  const slots = [], items = ['iron_sword', 'iron_pickaxe', 'bow', 'arrow', 'cobblestone', 'cooked_beef', 'water_bucket', 'water_bucket', 'white_bed'].map(name => ({ name,
    count: ({ arrow: 64, cobblestone: 64, cooked_beef: 8, white_bed: 4 })[name] || 1, durabilityUsed: 0 }));
  for (const [slot, name] of [[5, 'iron_helmet'], [6, 'iron_chestplate'], [7, 'iron_leggings'], [8, 'iron_boots'], [45, 'shield']]) slots[slot] = { name, count: 1, durabilityUsed: 0 };
  const bot = { registry, health: 20, food: 20, oxygenLevel: 20, inventory: { slots, items: () => items }, heldItem: items[0] };
  return { bot, items, goal: {}, task: new Task('End supplies') };
}
test('End preparation acquires a new bow when worn and requires real arrow, bridge and food reserves', async () => {
  for (const missing of ['bow', 'arrow', 'cobblestone', 'water_bucket', 'cooked_beef', null]) {
    const { bot, items, goal, task } = fixture(); const calls = [];
    const item = items.find(i => i.name === missing);
    if (missing === 'bow') item.durabilityUsed = registry.itemsByName.bow.maxDurability - 1;
    else if (item) item.count--;
    const ready = await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async (b, t, name, count) => calls.push({ name, count }) });
    assert.equal(ready, missing === null);
    if (missing === 'bow') assert.deepEqual(calls, [{ name: 'bow', count: 2 }]);
    if (missing === 'arrow') assert.deepEqual(calls, [{ name: 'arrow', count: 64 }]);
    if (missing === 'cobblestone') assert.deepEqual(calls, [{ name: 'cobblestone', count: 64 }]);
    // Two buckets: one for a landing, one against an enderman.
    if (missing === 'water_bucket') assert.deepEqual(calls, [{ name: 'water_bucket', count: 2 }]);
    if (missing === 'cooked_beef') { assert.deepEqual(calls, []); assert.equal(goal.preparingEnd, true); }
    if (!missing) assert.equal(goal.preparingEnd, undefined);
  }
});

test('four beds for the End: made from carried wool, and given up after twenty minutes of trying', async () => {
  const { bot, items, goal, task } = fixture();
  items.find(i => i.name === 'white_bed').count = 2;
  items.push({ name: 'black_wool', count: 3 });
  const calls = [];
  assert.equal(await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async (b, t, name, count) => calls.push({ name, count }) }), false);
  assert.deepEqual(calls, [{ name: 'black_bed', count: 1 }]);
  goal.endBeds.startedAt = Date.now() - 21 * 60000;
  items.pop();
  assert.equal(await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async () => assert.fail('no more bed hunting') }), true);
});

test('a top-up taken up a while: its time and what the count did meanwhile are said beside it (note 1307)', async () => {
  const { bot, items, goal, task } = fixture();
  const bow = items.find(i => i.name === 'bow'); bow.durabilityUsed = registry.itemsByName.bow.maxDurability - 1;
  goal.endKit = { spent: { bow: { ms: 40 * 60000, since: Date.parse('2026-10-05T17:04:00Z'), from: 0 } } };
  let text = '';
  task.opportunityClient = { systemOne: async ({ questions }) => { text = JSON.stringify(Object.values(questions)[0]); return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'top_up_bow', confidence: 0.9 }])) }; } };
  let slow = 0;
  await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async () => { slow++; } });
  assert.match(text, /Taken up already for about 40 minutes of play since 17:04Z, the bow carried going from 0 to \d+ meanwhile/);
  assert.equal(slow, 1);
  assert.ok(goal.endKit.spent.bow.ms >= 40 * 60000);
});

test('a counted top-up says what the rest would take at the pace so far (note 1337)', async () => {
  const { bot, items, goal, task } = fixture();
  const arrows = items.find(i => i.name === 'arrow');
  if (arrows) arrows.count = 3; else items.push({ name: 'arrow', count: 3 });
  goal.endKit = { spent: { arrows: { ms: 24 * 60000, since: Date.parse('2026-10-06T00:46:00Z'), from: 0 } } };
  let text = '';
  task.opportunityClient = { systemOne: async ({ questions }) => { text = JSON.stringify(Object.values(questions)[0]); return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'enter_now', confidence: 0.9 }])) }; } };
  await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async () => {} });
  assert.match(text, /the arrows carried going from 0 to 3 meanwhile\. At that pace \(3 in about 24 minutes\), the 61 more to 64 would take about 8 hours\./);
});

test('the water option says what a bucket costs and what the live End fights without one came to (note 1406)', () => {
  const { bot, items, goal } = fixture();
  for (const i of items.filter(i => i.name === 'water_bucket')) i.name = 'raw_iron';
  const water = kitItems(bot, goal).find(i => i.key === 'water');
  assert.equal(water.short, true);
  assert.match(water.says, /three iron ingots at a crafting table \(0 empty buckets, 0 iron ingots and 2 raw iron carried\)/);
  assert.match(water.says, /thrown 56 blocks up as it took off and died of the fall/);
});

test('the arrows the feathers and flint carried make are crafted first, not held back for a feather short of the whole step (full-2 2026-10-21, note 1982)', async () => {
  const { bot, items, goal, task } = fixture();
  items.find(i => i.name === 'arrow').count = 7;
  items.push({ name: 'feather', count: 7 }, { name: 'flint', count: 8 }, { name: 'stick', count: 11 });
  const calls = [];
  await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async (b, t, name, count) => calls.push({ name, count }) });
  assert.deepEqual(calls, [{ name: 'arrow', count: 35 }], '7 carried and 28 from the seven feathers');
});

// full-3 (2026-10-21 17:29 to 22:13Z): the End's kit asked for armour as a fight with the spider hunted before (note 2015).
test('the End kit asks for armour as the kit, not as a fight with a mob hunted before', async () => {
  const { bot, goal, task } = fixture();
  for (const s of [5, 6, 7, 8, 45]) bot.inventory.slots[s] = null;
  bot.game = { dimension: 'overworld' }; bot.entity = { position: { x: 0, y: 64, z: 0 } };
  goal.mobHunt = { entity: 'spider' };
  const asked = [];
  task.opportunityClient = { systemOne: async ({ questions, state }) => { asked.push(JSON.stringify({ questions, state })); return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'fight_with_carried', confidence: 0.6 }])) }; } };
  try { await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async () => {} }); } catch (_) {}
  const kit = asked.find(a => /fight_with_carried/.test(a));
  assert.ok(kit, `asked: ${asked.length}`);
  assert.doesNotMatch(kit, /spider/);
  assert.doesNotMatch(kit, /for this fight/);
  assert.match(kit, /for now; the pieces are back on the ladder/);
});

// full-3 (2026-10-21 17:29 to 23:03Z): portal lit at (2052, 42, 1511), spawn bed 1,800 blocks off, nine deaths far from it (note 2017).
test('with the portal lit and the bed slept in last far from it, making the portal home is offered, and walks a leg toward the ring with a bed', async () => {
  const { bot, items, goal, task } = fixture();
  items.find(i => i.name === 'bow').durabilityUsed = registry.itemsByName.bow.maxDurability - 1;
  bot.game = { dimension: 'overworld' }; bot.entity = { position: { x: 700.5, y: 103, z: 293.5 } };
  const lit = Date.now() - 5.5 * 3600000;
  bot._survivalState = { spawnBed: { foot: { x: 700, y: 103, z: 293 } }, deaths: [{ at: new Date(lit - 60000).toISOString(), position: { x: 2050, z: 1500 } },
    { at: new Date(lit + 3600000).toISOString(), position: { x: 851, z: 390 } }, { at: new Date(lit + 7200000).toISOString(), position: { x: 700, z: 300 } }] };
  goal.endPortal = { center: { x: 2052, y: 42, z: 1511 }, neededEyes: 0, insertions: [{ at: lit }] };
  goal.endKit = { spent: { bow: { ms: 73 * 60000, since: lit, from: 0 } } };
  let text = '';
  task.opportunityClient = { systemOne: async ({ questions }) => { text = JSON.stringify(Object.values(questions)[0]); return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'home_by_portal', confidence: 0.6 }])) }; } };
  const walks = [];
  await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async () => assert.fail('a bed is carried'), navigate: async (b, t, g) => walks.push(g) });
  assert.match(text, /Make the portal home first: carry the beds carried to the portal's ring, 18[12][90] blocks off/);
  assert.match(text, /The bed slept in last is 18[12][90] blocks from the portal/);
  assert.match(text, /Since the portal was lit, 5\.5 hours ago: 2 deaths, 1\d{3} to 18\d\d blocks from the ring, each coming back at the bed slept in last with nothing carried, and 73 minutes on the kit's top-ups\./);
  assert.equal(walks.length, 1);
  assert.ok(Math.abs(Math.hypot(walks[0].x - 700.5, walks[0].z - 293.5) - 64) < 2, `leg to ${walks[0].x}, ${walks[0].z}`);
  assert.equal(goal.endKit.choice.pick, 'home_by_portal');
  // Near its own bed: not offered.
  const { homeByPortal } = require('../src/end-supplies');
  bot._survivalState.spawnBed.foot = { x: 2040, y: 42, z: 1500 };
  assert.equal(homeByPortal(bot, goal), null);
});

// The user (2026-10-22): the spawn bed may be taken up and carried to the portal (note 2019).
test('standing by the bed slept in last, making the portal home takes it up and carries it, the walk and the world spawn said', async () => {
  const { bot, items, goal, task } = fixture();
  items.find(i => i.name === 'bow').durabilityUsed = registry.itemsByName.bow.maxDurability - 1;
  const bed = items.findIndex(i => i.name === 'white_bed'); items.splice(bed, 1);
  bot.game = { dimension: 'overworld' }; bot.entity = { position: new (require('vec3').Vec3)(701.5, 103, 294.5) };
  bot.spawnPoint = { x: 0, y: 64, z: 0 };
  bot._survivalState = { spawnBed: { foot: { x: 700, y: 103, z: 293 } } };
  let dug = null;
  bot.blockAt = p => (p.x === 700 && p.y === 103 && p.z === 293 && !dug ? { name: 'black_bed', position: p } : { name: 'air', position: p });
  bot.dig = async b => { dug = b; items.push({ name: 'black_bed', count: 1 }); };
  goal.endPortal = { center: { x: 2052, y: 42, z: 1511 }, neededEyes: 0 };
  let text = '';
  task.opportunityClient = { systemOne: async ({ questions }) => { text = JSON.stringify(Object.values(questions)[0]); return { answers: Object.fromEntries(Object.keys(questions).map(k => [k, { choice: 'home_by_portal', confidence: 0.6 }])) }; } };
  await prepareEndSupplies(bot, task, goal, () => {}, { acquireStep: async () => assert.fail('no bed made: the one here is taken'), navigate: async () => {} });
  assert.match(text, /take up the bed slept in last, 2 blocks off here, and carry it to the portal's ring, \d+ blocks off \(about 9 real minutes at the bot's walking pace of 3\.4 blocks a second, nights apart\)/);
  assert.match(text, /a death on the way comes back at the world spawn, \d+ blocks from the portal/);
  assert.ok(dug, 'the bed was dug');
});

// full-2 (2026-10-22 02:40:56Z): one chestplate at 0.06, its eight ingots' ore unsaid (note 2022).
test('a piece to make says the iron ore within reach and what making from no iron has taken', () => {
  const { ironNearSays } = require('../src/mob-hunt');
  const { Vec3 } = require('vec3');
  const bot = { registry, entity: { position: new Vec3(0, 40, 0) }, findBlocks: () => [new Vec3(10, 30, 0), new Vec3(20, 30, 0)] };
  assert.match(ironNearSays(bot, 8), /^ 2 iron ore within 48 blocks in what is loaded, the nearest 14 off \(a block of ore smelts to an ingot\), 8 wanted; in the record a piece begun with no iron carried was worn 34 minutes later, the one time\.$/);
  assert.match(ironNearSays({ ...bot, findBlocks: () => [] }, 8), /No iron ore within 48 blocks in what is loaded: the 8 ingots' ore is looked for first/);
  assert.equal(ironNearSays(bot, 0), '');
});

// full-2 (2026-10-22 02:16 to 07:41Z): its mineshaft's webs chosen four times, three deaths there unsaid (note 2024).
test("a web site's option says the bot's own deaths about it", () => {
  const { siteDeathsSays } = require('../src/mob-hunt');
  const now = Date.now();
  const bot = { _survivalState: { deaths: [
    { at: new Date(now - 300 * 60000).toISOString(), cause: 'was blown up by Creeper', position: { x: -336, y: -22, z: -527 }, dimension: 'overworld' },
    { at: new Date(now - 125 * 60000).toISOString(), cause: 'was blown up by Creeper', position: { x: -383, y: 27, z: -594 }, dimension: 'overworld' },
    { at: new Date(now - 2 * 60000).toISOString(), cause: 'was slain by Cave Spider', position: { x: -379, y: 22, z: -627 }, dimension: 'overworld' },
    { at: new Date(now - 60 * 60000).toISOString(), cause: 'was slain by Zombie', position: { x: -729, y: 68, z: -1505 }, dimension: 'overworld' } ] } };
  const says = siteDeathsSays(bot, { x: -370, y: 20, z: -600 });
  assert.match(says, /^The bot has died within 48 blocks of this site 2 times of its last 4 deaths: blown up by Creeper 125 minutes ago; slain by Cave Spider 2 minutes ago\. $/);
  assert.equal(siteDeathsSays(bot, { x: 500, y: 20, z: 500 }), '');
});
