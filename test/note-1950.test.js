'use strict';
// Note 1950. Standing in a Nether portal's sheet, the portal's cooldown never
// runs out (note 1943), and the way through is out of the sheet and back in.
// The way out goes across the sheet's plane: full-4 (2026-10-20 02:42 to
// 11:30Z) stood in its own portal at (-16, 87, 2), the sheet two wide along
// x, netherrack on the z-1 face and lava on the z+1 face, for nine hours at
// 5.6 health; 'forward' and 'back' went along the sheet from one portal cell
// to the next, and the rock face was never dug.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { Task } = require('../src/skills');

function sheetWorld() {
  // The sheet along x at z 2: portal at x -17 and -16, y 87..89; obsidian at
  // x -18 and -15; netherrack on the z 1 face, lava at the feet on the z 3 face.
  const blocks = new Map();
  const set = (x, y, z, name) => blocks.set(`${x},${y},${z}`, name);
  for (const y of [87, 88, 89]) { set(-17, y, 2, 'nether_portal'); set(-16, y, 2, 'nether_portal'); set(-18, y, 2, 'obsidian'); set(-15, y, 2, 'obsidian'); }
  for (const x of [-18, -17, -16, -15]) { set(x, 86, 2, 'obsidian'); set(x, 90, 2, 'obsidian'); }
  for (const x of [-18, -17, -16, -15]) for (const z of [1, 3]) { set(x, 86, z, 'netherrack'); for (const y of [87, 88]) set(x, y, z, 'netherrack'); }
  set(-16, 87, 3, 'lava'); set(-17, 87, 3, 'lava');
  const nameAt = p => blocks.get(`${p.x},${p.y},${p.z}`) || 'air';
  return { blocks, blockAt: p => { const name = nameAt(p); return { name, position: p, boundingBox: name === 'air' || name === 'lava' || name === 'nether_portal' ? 'empty' : 'block' }; } };
}

test('standing in the sheet, the step out goes across its plane: the rock face dug, the lava face refused, then back in and through (note 1950)', async () => {
  const { enterPortal } = require('../src/work');
  const world = sheetWorld();
  const controls = {}, dug = [], logs = [];
  let looking = null, outOnce = false, inside = 0;
  const bot = { entity: { position: new Vec3(-15.5, 87, 2.5), yaw: Math.PI / 2, pitch: 0 }, game: { dimension: 'the_nether' },
    pathfinder: { setGoal() {}, movements: {}, goto: async () => {}, isMoving: () => false },
    lookAt: async p => { looking = p; }, look: async () => {},
    setControlState: (key, on) => { controls[key] = on; }, clearControlStates() { for (const k of Object.keys(controls)) controls[k] = false; },
    blockAt: world.blockAt };
  const inPortalNow = () => world.blockAt(bot.entity.position.floored()).name === 'nether_portal';
  // The world: forward walks toward what is looked at; out of the sheet once,
  // a stand of six ticks in it goes through (the cooldown ran out outside).
  const tick = setInterval(() => {
    if (controls.forward && looking) {
      const dx = looking.x - bot.entity.position.x, dz = looking.z - bot.entity.position.z, d = Math.hypot(dx, dz) || 1;
      const next = bot.entity.position.offset(dx / d * 0.08, 0, dz / d * 0.08);
      if (world.blockAt(next.floored()).boundingBox === 'empty') bot.entity.position = next;
    }
    if (!inPortalNow()) outOnce = true;
    inside = inPortalNow() && !controls.forward ? inside + 1 : 0;
    if (outOnce && inside >= 6) bot.game.dimension = 'overworld';
  }, 50);
  const log = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
  try {
    await enterPortal(bot, new Task('portal'), new Vec3(-16, 87, 2), () => bot.game.dimension === 'overworld',
      { walk: async () => {}, dig: async (b, t, c) => { dug.push(`${c.x},${c.y},${c.z}`); world.blocks.delete(`${c.x},${c.y},${c.z}`); } });
  } finally { clearInterval(tick); console.log = log; }
  assert.deepEqual(dug.sort(), ['-16,87,1', '-16,88,1'], 'the netherrack on the z-1 face is dug, feet and head; the lava face is not stepped toward');
  assert(logs.some(l => /standing in the sheet with the face at \(-16, 87, 1\) closed by netherrack and netherrack/.test(l)), logs.join('\n'));
  assert.equal(bot.game.dimension, 'overworld', 'out, the cooldown ran out, and back in: through');
});

test('every face into lava or a drop: the sheet is not stepped out of and the failure says so', async () => {
  const { enterPortal } = require('../src/work');
  const world = sheetWorld();
  world.blocks.set('-16,87,1', 'lava'); world.blocks.set('-16,88,1', 'air');
  const bot = { entity: { position: new Vec3(-15.5, 87, 2.5), yaw: 0, pitch: 0 }, game: { dimension: 'the_nether' },
    pathfinder: { setGoal() {}, movements: {}, goto: async () => {}, isMoving: () => false }, lookAt: async () => {}, look: async () => {},
    setControlState() {}, clearControlStates() {}, blockAt: world.blockAt };
  await assert.rejects(enterPortal(bot, new Task('portal'), new Vec3(-16, 87, 2), () => false, { walk: async () => {}, dig: async () => { throw new Error('not dug'); } }), /Every face of the portal the bot stands in steps into fire, lava or a drop \(lava at -16, 87, 3; lava at -16, 87, 1\)/);
});
