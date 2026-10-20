'use strict';
// Note 1952. A stance that failed at once twice running here within five
// seconds is left out for five more, whatever the scene, and said so with
// its reason. The idle and scene rules need the scene unchanged, which a
// crowd of teleporting endermen never gives: full-3 (2026-10-20 08:18:54 to
// 57Z) was offered cap_fight again 0.2 to 0.7 seconds after each of five
// at-once failures ('Tried 5 times in the last 3 seconds here, and it
// failed'), took it each time, and died at 17.3 health to none in three
// seconds. The roof step now leaves its reason on the plan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { EventEmitter } = require('node:events');
const { Task } = require('../src/skills');
const { Survival } = require('../src/survival');

function endermenBot() {
  const mobs = [1, 2, 3].map(id => ({ id, name: 'enderman', type: 'hostile', position: new Vec3(1.5 + id, 64, 0.5), height: 2.9, width: 0.6, isValid: true }));
  const bot = Object.assign(new EventEmitter(), { game: { dimension: 'overworld', gameMode: 'survival', difficulty: 'normal' }, health: 17, food: 20, oxygenLevel: 20,
    entities: Object.fromEntries(mobs.map(m => [m.id, m])), time: { timeOfDay: 18000 }, registry: require('minecraft-data')('26.1'),
    entity: { position: new Vec3(0.5, 64, 0.5), onGround: true, width: 0.6, height: 1.8, velocity: new Vec3(0, 0, 0) },
    inventory: { items: () => [{ name: 'iron_sword', count: 1 }, { name: 'cobblestone', count: 64 }], slots: { 45: { name: 'shield' }, 5: { name: 'iron_helmet' }, 6: { name: 'iron_chestplate' }, 7: { name: 'iron_leggings' }, 8: { name: 'iron_boots' } }, emptySlotCount: () => 20 },
    blockAt: p => { const f = p.floored(); const s = f.y < 64; return { position: f, name: s ? 'stone' : 'air', boundingBox: s ? 'block' : 'empty', diggable: s }; },
    world: { raycast: () => null }, findBlocks: () => [], lookAt: async () => {}, look: async () => {}, equip: async () => {}, attack() {} });
  return { bot, mobs };
}

test('a stance that failed at once twice within five seconds is left out for five seconds with its reason, the scene changing or not (note 1952)', async () => {
  const { bot, mobs } = endermenBot();
  const survival = new Survival(bot, { navigate: async () => {} }, { state: { shelters: [] }, client: { systemOne: async () => ({}) } });
  survival.scoutRetreat = async () => {};
  let capRuns = 0;
  survival.stanceOptions = () => ({
    cap_fight: { description: 'Step into a two-high gap and fight from under it.', expects: { damage: 16, seconds: 15 }, run: async () => { capRuns++; survival.state.failWhy = 'the lid at (0, 66, 0) was not placed: Server refused to place'; return false; } },
    shield_guard: { description: 'Face the nearest with the shield raised.', expects: { damage: 120, seconds: 15 }, run: async () => true },
    retreat: { description: 'Run for footing out of their reach.', expects: { damage: 20, seconds: 2 }, run: async () => true },
    fight: { description: 'Fight here.', expects: { damage: 90, seconds: 20 }, run: async () => true },
  });
  const asked = [];
  survival.decide = async (task, g, save, q) => {
    const offered = Object.keys(q.tree);
    asked.push({ at: Date.now(), offered, state: q.state });
    return { path: [offered.includes('cap_fight') ? 'cap_fight' : 'shield_guard'] };
  };
  const real = Date.now; let t = real();
  try {
    Date.now = () => t;
    for (let i = 0; i < 6; i++) {
      // The endermen teleport about between askings: a new scene every time.
      for (const m of mobs) m.position = new Vec3(0.5 + (i % 3) + m.id * 0.7, 64, 0.5 + ((i * m.id) % 4) - 2);
      // And each asking comes after a blow: the health and the hurt time change the scene every time, as they did.
      bot.health = 17 - 2.5 * i; bot._recentHurtAt = t - 100;
      const danger = mobs.map(m => ({ entity: m, distance: m.position.distanceTo(bot.entity.position), visible: true }));
      await survival.stanceStep(new Task('x'), {}, () => {}, danger, false);
      t += 400;
    }
  } finally { Date.now = real; }
  assert.equal(capRuns, 2, `cap_fight ran ${capRuns} times: twice, then left out`);
  const withheld = asked.filter(a => !a.offered.includes('cap_fight'));
  assert(withheld.length >= 1, asked.map(a => a.offered.join('/')).join(' | '));
  const why = withheld[0].state.notOfferedNow?.find(f => f.choice === 'cap_fight')?.why;
  assert.match(why || '', /^failed at once 2 times in the last \d+ seconds here: the lid at \(0, 66, 0\) was not placed: Server refused to place; offered again in 5 seconds$/, String(why));
});

test('the roof step says why it was not taken (note 1952)', async () => {
  const roof = require('../src/enderman-roof');
  const { Vec3 } = require('vec3');
  const bot = { entity: { position: new Vec3(0.5, 64, 0.5), onGround: true }, blockAt: p => ({ name: 'air', boundingBox: 'empty', position: p.floored() }), inventory: { items: () => [{ name: 'cobblestone', count: 3 }] } };
  const plan = { kind: 'place', cell: new Vec3(0, 64, 0), blocks: 1, seconds: 2 };
  const task = new Task('roof');
  assert.equal(await roof.takeRoof(bot, task, { place: async () => { throw new Error('Server refused to place the block'); } }, plan), false);
  assert.equal(plan.why, 'the lid at (0, 66, 0) was not placed: Server refused to place the block');
  const bare = { kind: 'place', cell: new Vec3(0, 64, 0), blocks: 1, seconds: 2 };
  assert.equal(await roof.takeRoof({ ...bot, inventory: { items: () => [] } }, task, { place: async () => {} }, bare), false);
  assert.equal(bare.why, 'no block carried for the lid');
});
