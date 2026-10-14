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

test('a fall off the column mid-step is caught in the air: the water bucket goes to the hand at once (note 1483)', async () => {
  const { bot, goal, task, dig } = fixture();
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'water_bucket', count: 2 }];
  bot.entity.velocity = new (require('vec3').Vec3)(0, -0.08, 0);
  const equipped = [];
  bot.equip = async item => { equipped.push(item.name); };
  bot.stopDigging = () => {};
  const steps = [];
  const save = () => { if (goal.step) steps.push(goal.step.action); };
  // Pushed off the column 300 ms into the hold: in the air, falling, nothing within four blocks under.
  setTimeout(() => { bot.entity.position = new (require('vec3').Vec3)(2.5, 72, 0.5); bot.entity.onGround = false; bot.entity.velocity = new (require('vec3').Vec3)(0.1, -0.6, 0); bot.emit('physicsTick'); }, 300);
  // Landed on the island 300 ms later.
  setTimeout(() => { bot.entity.position = new (require('vec3').Vec3)(2.5, 64, 0.5); bot.entity.onGround = true; bot.entity.velocity = new (require('vec3').Vec3)(0, -0.08, 0); }, 600);
  await fightEndStep(bot, task, goal, save, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) });
  await new Promise(r => setTimeout(r, 600));
  assert.ok(steps.includes('protect_fall_with_water'), steps.join(','));
  assert.ok(equipped.includes('water_bucket'), equipped.join(','));
});

test('the way down chosen as the water drop: off the column\'s edge with the bucket, nothing dug (note 1484)', async () => {
  const { bot, goal, task } = fixture();
  const V = require('vec3').Vec3;
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'water_bucket', count: 2 }];
  bot.entity.velocity = new V(0, -0.08, 0);
  bot.entities[20].position = new V(80, 90, 80);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new V(0.5, 76, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  const equipped = [], dug = [];
  bot.equip = async item => { equipped.push(item.name); };
  bot.stopDigging = () => {};
  bot.controlState = {};
  bot.setControlState = (k, v) => {
    bot.controlState[k] = v;
    if (k === 'forward' && v) setTimeout(() => { bot.entity.position = new V(1.5, 75.4, 0.5); bot.entity.onGround = false; bot.entity.velocity = new V(0.1, -0.5, 0); bot.emit('physicsTick');
      setTimeout(() => { bot.entity.position = new V(1.5, 64, 0.5); bot.entity.onGround = true; bot.entity.velocity = new V(0, -0.08, 0); bot.emit('physicsTick'); }, 250); }, 60);
  };
  const steps = [];
  const save = () => { if (goal.step) steps.push(goal.step.action); };
  await fightEndStep(bot, task, goal, save, { navigate: async () => {}, dig: async (b, t, p) => { dug.push(p); }, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) });
  assert.ok(steps.includes('water_drop'), steps.join(','));
  assert.ok(equipped.includes('water_bucket'), equipped.join(','));
  assert.equal(dug.length, 0, dug.map(String).join(' '));
  assert.equal(Math.floor(bot.entity.position.y), 64);
  assert.equal(goal.endCombat.descents?.[0]?.kind, 'drop');
});

test('an end-stone column seven up from the island at 61 is still the bot\'s own pillar on its cell (note 1533)', async () => {
  const { bot, goal, task, dig } = fixture();
  // The island's ground at 61, the column of quarried end stone from 61 to 67, feet at 68.
  bot.blockAt = p => {
    const f = p.floored();
    if (f.x === 0 && f.z === 0 && f.y >= 61 && f.y < 68) return { name: 'end_stone', boundingBox: 'block', position: f };
    if (f.x === 20 && f.z === 0 && f.y >= 61 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
    return { name: f.y < 61 ? 'end_stone' : 'air', boundingBox: f.y < 61 ? 'block' : 'empty', position: f };
  };
  bot.entity.position = new Vec3(0.5, 68, 0.5);
  const steps = [];
  const save = () => { if (goal.step) steps.push(goal.step.action); };
  await fightEndStep(bot, task, goal, save, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) });
  assert.ok(steps.includes('hold_on_pillar'), steps.join(','));
});

test('the quarry digs no cell beside water nor within two of the pool poured for the drop (note 1534)', async () => {
  const { bot, goal, task, dig } = fixture();
  // On the island's flat ground at 64, 6 blocks carried, the crystal's pillar far off (lift 19); the pool poured at (3, 64, 0) east of the feet, its water flowed to (4, 64, 0).
  bot.entity.position = new Vec3(0.5, 64, 0.5);
  bot._pillarUp = null;
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'end_stone', count: 6 }, { name: 'water_bucket', count: 1 }, { name: 'bucket', count: 1 }];
  bot.entities[20].position = new Vec3(60, 90, 60);
  bot.blockAt = p => {
    const f = p.floored();
    if (f.x === 20 && f.z === 0 && f.y === 84) return { name: 'bedrock', boundingBox: 'block', position: f };
    if (f.x === 20 && f.z === 0 && f.y >= 64 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
    if (f.y === 64 && f.z === 0 && (f.x === 3 || f.x === 4)) return { name: 'water', boundingBox: 'empty', position: f };
    return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f };
  };
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() }, pool: { x: 3, y: 64, z: 0, dx: 1, dz: 0, at: Date.now() } };
  let seen = null;
  const client = { systemOne: async ({ questions }) => { seen = JSON.stringify(questions); return { answers: { branch_0: { choice: 'observe' } } }; } };
  await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig, place: async () => {} }, client);
  const look = goal.endCombat.quarryLook;
  assert.ok(look, 'the quarry was looked at');
  // The ring two to four out round (0, 0) at the feet's level and a block down: the cells with x 1 to 5, z -2 to 2 are beside the water or within two of the pool and are left; the rest are dug.
  assert.ok(look.cells >= 4, JSON.stringify(look));
  assert.ok(seen && seen.includes('quarry_blocks_30'), 'the quarry offered');
  // No cell within two of the pool: re-run the picker's rule on what the option would dig.
  const cellsNearPool = (goal.endCombat.quarryCells || []).filter(c => Math.max(Math.abs(c.x - 3), Math.abs(c.z - 0)) <= 2);
  assert.equal(cellsNearPool.length, 0, JSON.stringify(goal.endCombat.quarryCells));
});
test('the pool is taken back into the bucket where the drop lands, before anything walks the body off (note 1535)', async () => {
  const { bot, goal, task } = fixture();
  const V = require('vec3').Vec3;
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() }, pool: { x: 1, y: 64, z: 0, dx: 1, dz: 0, at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'water_bucket', count: 1 }, { name: 'bucket', count: 1 }];
  bot.entity.velocity = new V(0, -0.08, 0);
  bot.entities[20].position = new V(80, 90, 80);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new V(0.5, 76, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  bot.equip = async () => {};
  bot.stopDigging = () => {};
  bot.controlState = {};
  const was = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (f.x === 1 && f.y === 64 && f.z === 0) return { name: 'water', boundingBox: 'empty', position: f, getProperties: () => ({ level: 0 }) }; return was(p); };
  bot.findBlocks = ({ matching }) => matching === registry.blocksByName.water.id && bot.entity.position.y < 70 ? [new V(1, 64, 0)] : [];
  bot.setControlState = (k, v) => {
    bot.controlState[k] = v;
    if (k === 'forward' && v) setTimeout(() => { bot.entity.position = new V(1.5, 75.4, 0.5); bot.entity.onGround = false; bot.entity.velocity = new V(0.1, -0.5, 0); bot.emit('physicsTick');
      setTimeout(() => { bot.entity.position = new V(1.5, 64, 0.5); bot.entity.onGround = true; bot.entity.velocity = new V(0, -0.08, 0); bot.emit('physicsTick'); }, 250); }, 60);
  };
  const water = require('../src/water'), orig = water.fillWaterBucket, filled = [];
  water.fillWaterBucket = async (b, t, pos) => { filled.push(pos.clone()); };
  try {
    await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) });
  } finally { water.fillWaterBucket = orig; }
  assert.equal(Math.floor(bot.entity.position.y), 64);
  assert.ok(filled.some(p => p.x === 1 && p.y === 64 && p.z === 0), `taken back: ${filled.map(String).join(' ') || 'nothing'}`);
  assert.equal(goal.endCombat.pool, undefined, 'the pool record cleared');
});

test('a block standing one up in the pool\'s row is dug down before the pour (note 1536)', async () => {
  const { bot, goal, task } = fixture();
  const V = require('vec3').Vec3;
  bot.entity.position = new V(18.5, 64, 0.5);
  bot._pillarUp = null;
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'end_stone', count: 40 }, { name: 'water_bucket', count: 1 }];
  bot.entities[20].position = new V(60, 90, 60);
  const removed = new Set(), water = new Set();
  // The crystal's pillar at (20, 0), bedrock under the crystal; the ground at 63 everywhere, end stone a block up two cells out from the feet on every side.
  bot.blockAt = p => {
    const f = p.floored(), k = `${f.x},${f.y},${f.z}`;
    if (water.has(k)) return { name: 'water', boundingBox: 'empty', position: f };
    if (removed.has(k)) return { name: 'air', boundingBox: 'empty', position: f };
    if (f.x === 20 && f.z === 0 && f.y === 84) return { name: 'bedrock', boundingBox: 'block', position: f };
    if (f.x === 20 && f.z === 0 && f.y >= 64 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
    if (f.y === 64 && ((Math.abs(f.x - 18) === 2 && f.z === 0) || (Math.abs(f.z) === 2 && f.x === 18))) return { name: 'end_stone', boundingBox: 'block', position: f };
    return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f };
  };
  let looked = null;
  bot.lookAt = async p => { looked = p; };
  bot.activateItem = () => { if (looked) water.add(`${Math.floor(looked.x)},${Math.ceil(looked.y)},${Math.floor(looked.z)}`); };
  const dug = [];
  const dig = async (b, t, p) => { dug.push(p.clone()); removed.add(`${p.x},${p.y},${p.z}`); bot.entity.position = new V(p.x + .5, 64, p.z + .5); };
  const place = async () => { throw Object.assign(new Error('stop here'), { name: 'Cancelled' }); };
  // The trench's digs walk the body out along the row; the climb wants it back on the foot cell (note 1548).
  const walks = [];
  const navigate = async (b, t, g) => { walks.push(g); if (g.constructor.name === 'GoalBlock') bot.entity.position = new V(g.x + .5, g.y, g.z + .5); else if (g.constructor.name === 'GoalNear') bot.entity.position = new V(g.x + .5, 64, g.z + .5); };
  try {
    await fightEndStep(bot, task, goal, () => {}, { navigate, dig, place }, { systemOne: async ({ questions }) => ({ answers: { branch_0: { choice: JSON.stringify(questions).includes('pillar_punch_30') ? 'pillar_punch_30' : 'water_drop' } } }) });
  } catch (err) { if (err.name !== 'Cancelled') throw err; }
  assert.ok(walks.some(g => g.x === 18 && g.z === 0), `walked back to the foot cell: ${walks.map(g => `${g.x},${g.z}`).join(' ')}`);
  assert.equal(Math.floor(bot.entity.position.x), 18, 'the climb begins on the foot cell');
  assert.ok(dug.some(p => p.y === 64 && (Math.abs(p.x - 18) === 2 || Math.abs(p.z) === 2)), `the raised block dug: ${dug.map(String).join(' ') || 'nothing'}`);
  assert.ok(goal.endCombat?.pool, 'the pool poured and recorded');
  // The row dug one deep into a trench, the water in it (note 1540), three wide (note 1553).
  const trench = dug.filter(p => p.y === 63);
  assert.ok(trench.length >= 2, `the trench dug: ${dug.map(String).join(' ')}`);
  const rowCells = trench.filter(p => p.z === 0), sideCells = trench.filter(p => Math.abs(p.z) === 1);
  assert.ok(sideCells.length >= rowCells.length * 2 - 2 && sideCells.length >= 2, `the trench's sides dug: ${sideCells.length} beside ${rowCells.length}`);
  assert.equal(goal.endCombat.pool.y, 63, JSON.stringify(goal.endCombat.pool));
});

test('the climb\'s option says whether the drop\'s pool can be poured at the pillar\'s foot (note 1539)', async () => {
  const { bot, goal, task, dig } = fixture();
  const V = require('vec3').Vec3;
  bot.entity.position = new V(0.5, 64, 0.5);
  bot._pillarUp = null;
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'end_stone', count: 40 }, { name: 'water_bucket', count: 1 }];
  bot.entities[20].position = new V(60, 90, 60);
  for (const rim of [false, true]) {
    // Flat island to the pillar at (20, 0); at the rim, nothing but the void east of x 16.
    bot.blockAt = p => {
      const f = p.floored();
      if (f.x === 20 && f.z === 0 && f.y === 84) return { name: 'bedrock', boundingBox: 'block', position: f };
      if (f.x === 20 && f.z === 0 && f.y >= 40 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
      if (rim && f.x > 16) return { name: 'air', boundingBox: 'empty', position: f };
      return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f };
    };
    let said = null;
    const client = { systemOne: async ({ questions }) => { said = questions.branch_0.criteria; return { answers: { branch_0: { choice: 'observe' } } }; } };
    await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig, place: async () => {} }, client);
    assert.ok(said?.pillar_punch_30, Object.keys(said || {}).join(','));
    // The blocks the climb takes with its roofs, said (note 1541).
    assert.equal(said.pillar_punch_30.blocksForTheClimb, said.pillar_punch_30.blocks + Math.ceil(said.pillar_punch_30.blocks / 3));
    if (rim) assert.match(said.pillar_punch_30.wayDown, /no pool can be poured at this pillar's foot/);
    else assert.match(said.pillar_punch_30.wayDown, /a pool of water can be poured on level ground/);
  }
});


test('a block standing in the fall\'s way two cells out is said, and that side loses the pool (note 1543)', async () => {
  const { bot, goal, task } = fixture();
  const V = require('vec3').Vec3;
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() }, pool: { x: 2, y: 64, z: 0, dx: 1, dz: 0, at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'water_bucket', count: 2 }];
  bot.entity.velocity = new V(0, -0.08, 0);
  bot.entities[20].position = new V(80, 90, 80);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new V(0.5, 76, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  // The pool east at (2, 64, 0), and the stump of an old column at (2, 64..70, 0) standing in the way east; west is clear.
  const was = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (f.x === 2 && f.z === 0 && f.y >= 64 && f.y <= 70) return { name: 'end_stone', boundingBox: 'block', position: f }; if (f.x === 2 && f.z === 0 && f.y === 71) return { name: 'water', boundingBox: 'empty', position: f }; return was(p); };
  goal.endCombat.pool = { x: 2, y: 71, z: 0, dx: 1, dz: 0, at: Date.now() };
  bot.equip = async () => {}; bot.stopDigging = () => {}; bot.controlState = {};
  bot.setControlState = (k, v) => { bot.controlState[k] = v; if (k === 'forward' && v) setTimeout(() => { bot.entity.position = new V(-1.5, 75.4, 0.5); bot.entity.onGround = false; bot.entity.velocity = new V(-0.1, -0.5, 0); bot.emit('physicsTick'); setTimeout(() => { bot.entity.position = new V(-1.5, 64, 0.5); bot.entity.onGround = true; bot.entity.velocity = new V(0, -0.08, 0); bot.emit('physicsTick'); }, 250); }, 60); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) }); }
  finally { console.log = log; }
  const sides = lines.find(l => l.includes("the drop's sides from"));
  assert.ok(sides, lines.filter(l => l.includes('drop')).join('\n'));
  assert.match(sides, /east: .*end_stone in the fall's way at \(2, 70, 0\)/);
  assert.match(sides, /west taken/);
});

test('the dragon\'s body at its perch, or where it comes down to sit, is a walk hazard of eight blocks, except for the run under its head (note 1544)', () => {
  const { endHazards } = require('../src/end-combat');
  const { bot } = fixture();
  const V = require('vec3').Vec3, dragon = bot.entities[20], phase = registry.entitiesByName.ender_dragon.metadataKeys.indexOf('phase');
  dragon.position = new V(12.5, 66, 0.5); dragon.metadata[phase] = 6;
  let body = endHazards(bot).find(h => h.entity.name === 'ender_dragon_body');
  assert.ok(body, 'the perched body is a hazard'); assert.equal(body.radius, 8); assert.equal(body.entity.position.x, 12.5);
  // Already within the eight (under the head for the sword): the place is not unsafe for it.
  bot.entity.position = new V(8.5, 64, 0.5);
  assert.ok(!endHazards(bot).some(h => h.entity.name === 'ender_dragon_body'), 'no hazard from inside');
  bot.entity.position = new V(0.5, 76, 0.5);
  assert.ok(!endHazards(bot).some(h => h.entity.name === 'ender_dragon'), 'the perched dragon itself is not run from');
  bot._underHeadRun = true;
  assert.ok(!endHazards(bot).some(h => h.entity.name === 'ender_dragon_body'), 'the run under the head goes to it');
  bot._underHeadRun = false;
  // Coming down to sit (phase 3), still 20 blocks off in the air: the hazard is the fountain, where it lands.
  dragon.position = new V(20, 80, 0); dragon.metadata[phase] = 3; bot._arenaCenter = { x: 12.5, y: 66, z: 0.5 };
  body = endHazards(bot).find(h => h.entity.name === 'ender_dragon_body');
  assert.ok(body && body.entity.position.x === 12.5, JSON.stringify(endHazards(bot).map(h => h.entity.name)));
  // Circling: no body hazard.
  dragon.metadata[phase] = 0;
  assert.ok(!endHazards(bot).some(h => h.entity.name === 'ender_dragon_body'));
});


test('a pool recorded two cells to one side of the drop\'s row is not the drop\'s pool (note 1545)', async () => {
  const { bot, goal, task } = fixture();
  const V = require('vec3').Vec3;
  // The pool east of the column but two cells south of its row: water at (2, 64, 2), recorded as east.
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() }, pool: { x: 2, y: 64, z: 2, dx: 1, dz: 0, at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'water_bucket', count: 2 }];
  bot.entity.velocity = new V(0, -0.08, 0);
  bot.entities[20].position = new V(80, 90, 80);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new V(0.5, 76, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  const was = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (f.x === 2 && f.y === 64 && f.z === 2) return { name: 'water', boundingBox: 'empty', position: f }; return was(p); };
  bot.equip = async () => {}; bot.stopDigging = () => {}; bot.controlState = {};
  bot.setControlState = (k, v) => { bot.controlState[k] = v; if (k === 'forward' && v) setTimeout(() => { bot.entity.position = new V(1.5, 75.4, 0.5); bot.entity.onGround = false; bot.entity.velocity = new V(0.1, -0.5, 0); bot.emit('physicsTick'); setTimeout(() => { bot.entity.position = new V(1.5, 64, 0.5); bot.entity.onGround = true; bot.entity.velocity = new V(0, -0.08, 0); bot.emit('physicsTick'); }, 250); }, 60); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) }); }
  finally { console.log = log; }
  const sides = lines.find(l => l.includes("the drop's sides from"));
  assert.ok(sides, lines.filter(l => l.includes('drop')).join('\n'));
  assert.doesNotMatch(sides, /east: 12 down, the pool/);
});


test('the quarry reaches out to seven when the ring two to four out is the pit of an earlier quarry (note 1547)', async () => {
  const { bot, goal, task, dig } = fixture();
  const V = require('vec3').Vec3;
  bot.entity.position = new V(0.5, 64, 0.5);
  bot._pillarUp = null;
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'end_stone', count: 6 }, { name: 'water_bucket', count: 1 }];
  bot.entities[20].position = new V(60, 90, 60);
  // A pit: the ground at 63 within four of the feet (the feet at 64 on its floor), the island's top at 64 from five out.
  bot.blockAt = p => {
    const f = p.floored();
    if (f.x === 20 && f.z === 0 && f.y === 84) return { name: 'bedrock', boundingBox: 'block', position: f };
    if (f.x === 20 && f.z === 0 && f.y >= 64 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
    const r = Math.max(Math.abs(f.x), Math.abs(f.z));
    const top = r <= 4 ? 63 : 64;
    return { name: f.y <= top ? 'end_stone' : 'air', boundingBox: f.y <= top ? 'block' : 'empty', position: f };
  };
  let seen = null;
  const client = { systemOne: async ({ questions }) => { seen = questions.branch_0.criteria; return { answers: { branch_0: { choice: 'observe' } } }; } };
  await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig, place: async () => {} }, client);
  assert.ok(goal.endCombat.quarryLook?.cells >= 4, JSON.stringify(goal.endCombat.quarryLook));
  assert.ok(seen?.quarry_blocks_30, Object.keys(seen || {}).join(','));
});

test('the floor falling away beyond the landing is the island\'s edge, and that side is set aside (note 1569)', async () => {
  const { bot, goal, task } = fixture();
  const V = require('vec3').Vec3;
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() } };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'water_bucket', count: 2 }];
  bot.entity.velocity = new V(0, -0.08, 0);
  bot.entities[20].position = new V(80, 90, 80);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new V(0.5, 76, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  // East of the column the island ends at x 1: nothing under the cells from x 2 on.
  const was = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (f.x >= 2 && f.y < 64 && f.z === 0) return { name: 'air', boundingBox: 'empty', position: f }; return was(p); };
  bot.equip = async () => {}; bot.stopDigging = () => {}; bot.controlState = {};
  bot.setControlState = (k, v) => { bot.controlState[k] = v; if (k === 'forward' && v) setTimeout(() => { bot.entity.position = new V(-1.5, 75.4, 0.5); bot.entity.onGround = false; bot.entity.velocity = new V(-0.1, -0.5, 0); bot.emit('physicsTick'); setTimeout(() => { bot.entity.position = new V(-1.5, 64, 0.5); bot.entity.onGround = true; bot.entity.velocity = new V(0, -0.08, 0); bot.emit('physicsTick'); }, 250); }, 60); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) }); }
  finally { console.log = log; }
  const sides = lines.find(l => l.includes("the drop's sides from"));
  assert.ok(sides, lines.filter(l => l.includes('drop')).join('\n'));
  assert.match(sides, /east: 12 down.*the floor falls away 2 out \(the edge\)/);
  assert.doesNotMatch(sides, /east taken/);
});

test('up onto the top, the run walks in off the cliff\'s lip toward the island\'s middle (note 1571)', async () => {
  const { bot, goal, task } = fixture();
  // On the shelf at 45 east of the middle, the cliff's face west of the feet rising to the top at 52; no column of its own.
  delete bot._pillarUp;
  bot.entity.position = new Vec3(50.5, 45, -26.5);
  bot.blockAt = p => {
    const f = p.floored();
    if (f.x >= 20 && f.x <= 49 && f.y < 52) return { name: 'end_stone', boundingBox: 'block', position: f };
    if (f.x >= 50 && f.x <= 58 && f.y < 45) return { name: 'end_stone', boundingBox: 'block', position: f };
    return { name: 'air', boundingBox: 'empty', position: f };
  };
  bot.entities[30].position = new Vec3(-30.5, 85, 0.5);
  bot.entities[20].position = new Vec3(0, 90, 0);
  const pr = require('../src/pillar-recovery'), up = pr.pillarUp;
  pr.pillarUp = async (b, t, y) => { b.entity.position = new Vec3(50.5, y, -26.5); };
  bot.setControlState = (k, v) => { if (k === 'forward' && v) bot.entity.position = new Vec3(49.5, 52, -26.5); };
  const walks = [];
  const navigate = async (b, t, g) => { walks.push({ x: g.x, y: g.y, z: g.z }); if (g.x === 50 && g.y === 45) b.entity.position = new Vec3(50.5, 45, -26.5); else b.entity.position = new Vec3(g.x + .5, g.y, g.z + .5); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate, dig: async () => {}, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'climb_to_the_top' } } }) }); }
  finally { console.log = log; pr.pillarUp = up; }
  assert.ok(lines.some(l => l.includes("up onto the island's top")), lines.filter(l => l.includes('end combat')).join('\n'));
  const inward = walks.find(w => w.y === 52 && w.x <= 44);
  assert.ok(inward, `no walk inward: ${JSON.stringify(walks)}`);
  assert.match(lines.find(l => l.includes("in off the cliff's lip")) || '', /\d+ blocks in at/);
});

test('on the column with the pool at its foot, the drop is offered beside the dig (note 1572)', async () => {
  const { bot, goal, task } = fixture();
  // The pool a block east of the column's foot at 64; no water carried, the pool is the landing.
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'bucket', count: 2 }];
  const blockAt = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (f.x === 1 && f.y === 64 && f.z === 0) return { name: 'water', boundingBox: 'empty', position: f }; return blockAt(p); };
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() }, pool: { x: 1, y: 64, z: 0, dx: 1, dz: 0, at: Date.now() } };
  bot.entities[20].position = new Vec3(60, 90, 60);
  let seen = null;
  const client = { systemOne: async ({ questions }) => { seen = questions.branch_0.criteria; return { answers: { branch_0: { choice: 'observe' } } }; } };
  await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, client);
  assert.ok(seen, 'a question was asked');
  const text = JSON.stringify(seen);
  assert.ok(text.includes('pillar_down'), text.slice(0, 600));
  assert.ok(text.includes('water_drop'), text.slice(0, 600));
  assert.match(text, /12 blocks down onto the island at \(1, 0\), into the pool/);
});

test('on the ground with both buckets empty and water left standing, the walk back for it is offered and told at the pillar (note 1572)', async () => {
  const { bot, goal, task } = fixture();
  delete bot._pillarUp;
  bot.entity.position = new Vec3(0.5, 64, 0.5);
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 40 }, { name: 'bucket', count: 2 }];
  const blockAt = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (f.x === 30 && f.y === 63 && f.z === 20) return { name: 'water', boundingBox: 'empty', position: f }; if (f.x === 0 && f.z === 0 && f.y >= 64) return { name: 'air', boundingBox: 'empty', position: f }; if (f.x === 20 && f.z === 0 && f.y === 84) return { name: 'bedrock', boundingBox: 'block', position: f }; return blockAt(p); };
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, poolsLeft: [{ x: 30, y: 63, z: 20, at: Date.now() }] };
  bot.entities[20].position = new Vec3(-60, 90, -60);
  let seen = null;
  const client = { systemOne: async ({ questions }) => { seen = questions.branch_0.criteria; return { answers: { branch_0: { choice: 'observe' } } }; } };
  await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, client);
  const text = JSON.stringify(seen);
  assert.ok(text.includes('take_back_water'), text.slice(0, 800));
  assert.match(text, /Walk 36 blocks to the water left standing at \(30, 63, 20\)/);
  assert.match(text, /no water is carried to pour the pool at this pillar/);
  assert.match(text, /the water left at \(30, 63, 20\), 36 blocks off/);
});

test('the pool is recorded where the source went in, and the step\'s start does not take it back (note 1574)', async () => {
  const { bot, goal, task } = fixture();
  const { sourceWater } = require('../src/water');
  // On the ground at (18, 64), the pillar at (20, 0); the click puts the source at the feet, the flow reaches the trench cell.
  delete bot._pillarUp;
  bot.entity.position = new Vec3(18.5, 64, 0.5);
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 40 }, { name: 'water_bucket', count: 1 }, { name: 'bucket', count: 1 }];
  const water = new Map(), removed = new Set();
  bot.blockAt = p => {
    const f = p.floored(), k = `${f.x},${f.y},${f.z}`;
    if (water.has(k)) return { name: 'water', boundingBox: 'empty', position: f, getProperties: () => ({ level: water.get(k) }), _properties: { level: water.get(k) } };
    if (removed.has(k)) return { name: 'air', boundingBox: 'empty', position: f };
    if (f.x === 20 && f.z === 0 && f.y === 84) return { name: 'bedrock', boundingBox: 'block', position: f };
    if (f.x === 20 && f.z === 0 && f.y >= 64 && f.y <= 83) return { name: 'obsidian', boundingBox: 'block', position: f };
    return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f };
  };
  bot.findBlocks = ({ matching, useExtraInfo }) => matching === registry.blocksByName.water.id ? [...water.keys()].map(k => new Vec3(...k.split(',').map(Number))).filter(p => !useExtraInfo || useExtraInfo(bot.blockAt(p))) : [];
  let looked = null;
  bot.lookAt = async p => { looked = p; };
  // The source lands under the feet; every trench cell below gets the flow.
  bot.activateItem = () => { const feet = bot.entity.position.floored(); water.set(`${feet.x},${feet.y},${feet.z}`, 0); for (const k of removed) { const [x, y, z] = k.split(',').map(Number); if (y === 63) water.set(`${x},${y},${z}`, 8); } };
  const dig = async (b, t, p) => { removed.add(`${p.x},${p.y},${p.z}`); };
  const place = async () => { throw Object.assign(new Error('stop here'), { name: 'Cancelled' }); };
  const navigate = async (b, t, g) => { if (g.constructor.name === 'GoalBlock') bot.entity.position = new Vec3(g.x + .5, g.y, g.z + .5); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try {
    await fightEndStep(bot, task, goal, () => {}, { navigate, dig, place }, { systemOne: async ({ questions }) => ({ answers: { branch_0: { choice: JSON.stringify(questions).includes('pillar_punch_30') ? 'pillar_punch_30' : 'water_drop' } } }) });
  } catch (err) { if (err.name !== 'Cancelled') throw err; } finally { console.log = log; }
  const pool = goal.endCombat?.pool;
  assert.ok(pool, 'the pool recorded');
  assert.ok(sourceWater(bot.blockAt(new Vec3(pool.x, pool.y, pool.z))), `the pool is the source: ${JSON.stringify(pool)}`);
  assert.ok(lines.some(l => l.includes('the water went in at')), lines.filter(l => l.includes('pool')).join('\n'));
});

test('the hold on the column lays the pocket against the wings: two blocks on every open side, the far side first (note 1575)', async () => {
  const { bot, goal, task } = fixture();
  const placed = new Set();
  const blockAt = bot.blockAt;
  bot.blockAt = p => { const f = p.floored(); if (placed.has(`${f.x},${f.y},${f.z}`)) return { name: 'cobblestone', boundingBox: 'block', position: f }; return blockAt(p); };
  const order = [];
  bot.placeBlock = async (ref, face) => { const c = ref.position.plus(face); placed.add(`${c.x},${c.y},${c.z}`); order.push(c); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) }); }
  finally { console.log = log; }
  const pocket = lines.find(l => l.includes('a pocket against the wings'));
  assert.ok(pocket, lines.filter(l => l.includes('end combat')).join('\n'));
  assert.match(pocket, /4 of 4 sides closed/);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1]) assert.ok(placed.has(`${dx},${76 + dy},${dz}`), `the wall at ${dx},${76 + dy},${dz}: ${[...placed].join(' ')}`);
  // The dragon at (8, 80, 0), east: the west side (-1, 0) is laid first, after the roof's post.
  const roofAt = order.findIndex(c => c.x === 0 && c.z === 0 && c.y === 78);
  const firstWall = order.slice(roofAt + 1).find(c => c.y === 76 && (Math.abs(c.x) === 1 || Math.abs(c.z) === 1));
  assert.ok(firstWall && firstWall.x === -1, `the far side first: ${order.map(String).join(' ')}`);
});

test('a cloud under the feet is said in pillar_down, and the dig down stops over it (note 1576)', async () => {
  const { bot, dug, dig, goal, task } = fixture();
  // The cloud two below the column's top, where the fireball burst on the way up; the dragon far off.
  bot.entities[20].position = new Vec3(60, 90, 60);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new Vec3(0.5, 74, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  let seen = null;
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async ({ questions }) => { seen = JSON.stringify(questions); return { answers: { branch_0: { choice: 'pillar_down' } } }; } }); }
  finally { console.log = log; }
  assert.ok(seen && seen.includes('pillar_down'), seen && seen.slice(0, 300));
  assert.match(seen, /the breath's cloud lies 2 blocks below the feet, 5 wide: a dig down ends in it/);
  assert.equal(dug.length, 0, `dug into the cloud: ${dug.map(String).join(' ')}`);
  assert.ok(lines.some(l => l.includes('the dig down stops at')), lines.filter(l => l.includes('end combat')).join('\n'));
});

test('inside the pocket the column still reads as the bot\'s own, the dig goes down, and the drop digs the pool side\'s wall and its post (note 1577)', async () => {
  const { bot, dug, dig, goal, task } = fixture();
  // The pocket round the top at 76: walls at 76 and 77 on every side, posts at 75; the pool south at (0, 64, 1); the dragon far off.
  const walls = new Set();
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [75, 76, 77]) walls.add(`${dx},${dy},${dz}`);
  walls.add('0,78,0');
  const blockAt = bot.blockAt;
  // The column of quarried end stone, as the live climbs lay it (note 1581).
  bot.blockAt = p => { const f = p.floored(), k = `${f.x},${f.y},${f.z}`; if (walls.has(k)) return { name: 'cobblestone', boundingBox: 'block', position: f }; if (f.x === 0 && f.y === 64 && f.z === 1) return { name: 'water', boundingBox: 'empty', position: f }; if (f.x === 0 && f.z === 0 && f.y >= 64 && f.y < 76) return { name: 'end_stone', boundingBox: 'block', position: f }; return blockAt(p); };
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 20 }, { name: 'bucket', count: 2 }];
  bot.entities[20].position = new Vec3(60, 90, 60);
  goal.endCombat = { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0, descent: { pick: 'water_drop', at: Date.now() }, pool: { x: 0, y: 64, z: 1, dx: 0, dz: 1, at: Date.now() } };
  const digWalls = async (b, t, p) => { walls.delete(`${p.x},${p.y},${p.z}`); dug.push(p.clone()); };
  let seen = null;
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: digWalls, place: async () => {} }, { systemOne: async ({ questions }) => { seen = JSON.stringify(questions); return { answers: { branch_0: { choice: 'water_drop' } } }; } }); }
  finally { console.log = log; }
  assert.ok(seen && seen.includes('"pillar_down":{') && seen.includes('"water_drop":{'), `pillar_down and water_drop offered in the pocket (note 1581): ${seen && seen.slice(0, 400)}`);
  assert.ok(!seen.includes('open_walls'), 'the pocket is not a box to open (note 1579)');
  const sides = lines.find(l => l.includes("the drop's sides from"));
  assert.ok(sides && /south.*walled by the bot's own blocks: dug first/.test(sides), lines.filter(l => l.includes('drop')).join('\n'));
  for (const y of [75, 76, 77]) assert.ok(dug.some(p => p.x === 0 && p.z === 1 && p.y === y), `the south wall and post dug: ${dug.map(String).join(' ')}`);
  assert.ok(lines.some(l => /the water drop from \(0, 76, 0\)/.test(l)), lines.filter(l => l.includes('water drop')).join('\n'));
});

test('the pillars offered are the three cheapest by lift and walk, not the two nearest (note 1582)', async () => {
  const { bot, goal, task } = fixture();
  delete bot._pillarUp;
  bot.entity.position = new Vec3(0.5, 64, 0.5);
  bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1 }, { name: 'cobblestone', count: 40 }, { name: 'water_bucket', count: 2 }];
  bot.entities[20].position = new Vec3(-60, 90, -60);
  // Three pillars: 30 near and middling (20 off, top 84), 32 near and tall (20 off, top 109), 31 far and short (50 off, top 71).
  const pillars = [{ x: 20, z: 0, top: 84 }, { x: 0, z: 20, top: 109 }, { x: 50, z: 0, top: 71 }];
  bot.blockAt = p => {
    const f = p.floored();
    for (const q of pillars) { if (f.x === q.x && f.z === q.z && f.y === q.top) return { name: 'bedrock', boundingBox: 'block', position: f }; if (f.x === q.x && f.z === q.z && f.y >= 64 && f.y < q.top) return { name: 'obsidian', boundingBox: 'block', position: f }; }
    return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f };
  };
  bot.entities[30].position = new Vec3(20.5, 85, 0.5);
  bot.entities[32] = { id: 32, name: 'end_crystal', position: new Vec3(0.5, 110, 20.5), isValid: true, metadata: {}, width: 2, height: 2 };
  bot.entities[31] = { id: 31, name: 'end_crystal', position: new Vec3(50.5, 72, 0.5), isValid: true, metadata: {}, width: 2, height: 2 };
  let seen = null;
  await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig: async () => {}, place: async () => {} }, { systemOne: async ({ questions }) => { seen = JSON.stringify(questions); return { answers: { branch_0: { choice: 'observe' } } }; } });
  assert.ok(seen, 'a question was asked');
  assert.ok(/pillar_punch_31|crystal_31|quarry_blocks_31/.test(seen), `the far short pillar offered: ${seen.slice(0, 300)}`);
  assert.ok(/pillar_punch_30|crystal_30|quarry_blocks_30/.test(seen), `the near pillar offered: ${seen.slice(0, 300)}`);
});

test('in the cloud on thick ground with no run, the body goes two up before any dig (note 1583)', async () => {
  const { bot, goal, task } = fixture();
  delete bot._pillarUp;
  // The island's thick ground at 64 everywhere, the body in a hollow a block deep with walls two high round it: no run out, and the cloud on it.
  bot.entity.position = new Vec3(0.5, 64, 0.5);
  const placed = new Set();
  bot.blockAt = p => { const f = p.floored(), k = `${f.x},${f.y},${f.z}`; if (placed.has(k)) return { name: 'cobblestone', boundingBox: 'block', position: f }; if (f.x === 0 && f.z === 0) return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f }; return { name: f.y < 69 ? 'end_stone' : 'air', boundingBox: f.y < 69 ? 'block' : 'empty', position: f }; };
  bot.placeBlock = async (ref, face) => { const c = ref.position.plus(face); placed.add(`${c.x},${c.y},${c.z}`); if (c.x === 0 && c.z === 0) { bot.entity.position = new Vec3(0.5, c.y + 1, 0.5); } };
  bot.setControlState = () => {};
  bot.entities[20].position = new Vec3(8, 70, 0);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new Vec3(0.5, 64, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  const dug = [];
  const dig = async (b, t, p) => { dug.push(p.clone()); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => { throw Object.assign(new Error('no route'), { name: 'NoEscape' }); }, dig, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) }); }
  catch (err) { if (!['NoEscape', 'Cancelled', 'Blocked'].includes(err.name)) throw err; }
  finally { console.log = log; }
  const up = lines.find(l => l.includes('up out of the breath on'));
  assert.ok(up, `${JSON.stringify(goal.step)} ${JSON.stringify(goal.endCombat?.emptyChoice || null)} ${lines.join(' | ').slice(0, 600)}`);
  // The fixture cannot climb (no physics); the branch taken is the test, not the height.
  assert.match(up, /up out of the breath on the ground: \d blocks up/);
  assert.equal(dug.filter(p => p.x === 0 && p.z === 0 && p.y < 64).length, 0, `dug down into the ground: ${dug.map(String).join(' ')}`);
});

test('in the cloud one block up a short column with blocks carried, the body goes two up, not one down into it (note 1590)', async () => {
  const { bot, goal, task } = fixture();
  // A one-block column at (0, 64) on the island at 64: the feet at 65, the cloud at the feet; the dragon over the island, a pass coming.
  bot._pillarUp = { x: 0, z: 0, until: Date.now() + 600000 };
  bot.entity.position = new Vec3(0.5, 65, 0.5);
  const placed = new Set();
  // The quarry's pit east of the column, three deep: the column reads as the bot's own (a drop of three beside it).
  bot.blockAt = p => { const f = p.floored(), k = `${f.x},${f.y},${f.z}`; if (placed.has(k)) return { name: 'cobblestone', boundingBox: 'block', position: f }; if (f.x === 0 && f.z === 0 && f.y === 64) return { name: 'cobblestone', boundingBox: 'block', position: f }; if (f.x === 1 && f.z === 0 && f.y >= 61) return { name: 'air', boundingBox: 'empty', position: f }; return { name: f.y < 64 ? 'end_stone' : 'air', boundingBox: f.y < 64 ? 'block' : 'empty', position: f }; };
  bot.placeBlock = async (ref, face) => { const c = ref.position.plus(face); placed.add(`${c.x},${c.y},${c.z}`); if (c.x === 0 && c.z === 0) bot.entity.position = new Vec3(0.5, c.y + 1, 0.5); };
  bot.setControlState = () => {};
  bot.entities[20].position = new Vec3(6, 72, 0);
  const cloud = { id: 40, name: 'area_effect_cloud', position: new Vec3(0.5, 65, 0.5), isValid: true, metadata: {} };
  cloud.metadata[registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius')] = 3;
  bot.entities[40] = cloud;
  const dug = [];
  const dig = async (b, t, p) => { dug.push(p.clone()); };
  const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
  try { await fightEndStep(bot, task, goal, () => {}, { navigate: async () => {}, dig, place: async () => {} }, { systemOne: async () => ({ answers: { branch_0: { choice: 'observe' } } }) }); }
  catch (err) { if (!['NoEscape', 'Cancelled', 'Blocked'].includes(err.name)) throw err; }
  finally { console.log = log; }
  assert.ok(lines.some(l => l.includes('up out of the breath on the short column')), lines.filter(l => l.includes('end combat')).join('\n'));
  assert.equal(dug.filter(p => p.x === 0 && p.z === 0 && p.y === 64).length, 0, `dug the column down into the cloud: ${dug.map(String).join(' ')}`);
});
