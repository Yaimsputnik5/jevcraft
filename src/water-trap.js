'use strict';
// Water the walk keeps putting the body back into (note 2177). full-3
// (25593, 2026-10-26 08:23 to 08:56Z), on its walk to the End portal, sank
// into a water hole at (2066, 51, 1411), was lifted out to the bank a block
// off by the body's air question (swim_to_land, 0.5 seconds), and the walk
// stepped straight back in: 261 askings of body_way in 33 minutes, the same
// three ways each time, none of them about the walk. The air question now
// knows how often this water has had the body lately, and offers the ways
// that change the walk: keep this water out of the walk's way for ten
// minutes (movement.js keepOut), fill the cell with a block from the bank,
// or a carried boat placed from the water and paddled to land (boats.js
// boatFromWater), each said with what it costs.
const KEEP_OUT_MS = 10 * 60000, WINDOW_MS = 10 * 60000;
const key = c => `${c.x},${c.y},${c.z}`;
const cellOf = p => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });

// Each time the body's air question is asked: the water cell the feet are in, counted.
function note(goal, feet, now = Date.now()) {
  if (!goal) return null;
  const c = cellOf(feet), traps = goal.waterTraps ||= {};
  for (const [k, t] of Object.entries(traps)) if (now - t.last > WINDOW_MS) delete traps[k];
  // Within a block across and two up or down is the same water.
  const same = Object.values(traps).find(t => Math.abs(t.x - c.x) <= 1 && Math.abs(t.z - c.z) <= 1 && Math.abs(t.y - c.y) <= 2);
  // One count a rescue, not one an asking (note 2189): the askings came fifteen to two seconds and the count ran to 15.
  if (same) { if (now - same.last >= 15000) same.count++; same.last = now; same.y = Math.min(same.y, c.y); return same; }
  const t = { ...c, count: 1, first: now, last: now };
  traps[key(c)] = t;
  return t;
}

// The trap here, if this water has had the body more than once lately.
function here(goal, feet, now = Date.now()) {
  const c = cellOf(feet);
  const t = Object.values(goal?.waterTraps || {}).find(t => now - t.last <= WINDOW_MS && Math.abs(t.x - c.x) <= 1 && Math.abs(t.z - c.z) <= 1 && Math.abs(t.y - c.y) <= 2);
  return t && t.count >= 2 ? t : null;
}

function says(t, goal, now = Date.now()) {
  const mins = Math.max(1, Math.round((now - t.first) / 60000));
  const step = goal?.step?.action ? ` The work under way is ${String(goal.step.action).replaceAll('_', ' ')}${goal.step.target ? ` toward (${Math.round(goal.step.target.x)}, ${Math.round(goal.step.target.z)})` : ''}, and its walk is what brings the body back here.` : '';
  return `This water at (${t.x}, ${t.y}, ${t.z}) has had the body under ${t.count} times in the last ${mins} minute${mins === 1 ? '' : 's'}: each time the swim to the bank got it out, and the walk went back in.${step} The three swims below get the body out again and change nothing about the walk.`;
}

// The cells kept out of every walk for ten minutes: the trap's column, a block round it.
function keepOut(bot, goal, t, now = Date.now()) {
  const cells = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -2; dy <= 3; dy++) cells.push(`${t.x + dx},${t.y + dy},${t.z + dz}`);
  const list = (bot._keepOut ||= []).filter(k => k.until > now);
  list.push({ cells: new Set(cells), until: now + KEEP_OUT_MS, why: `the water at (${t.x}, ${t.y}, ${t.z}) the walk kept going back into` });
  bot._keepOut = list;
  t.keptOut = now;
  if (goal) { goal.waterTraps[key(t)] = t; }
  return cells.length;
}
// For movement.js: whether a cell is kept out of the walks now.
function refused(bot, p, now = Date.now()) {
  const list = bot?._keepOut;
  if (!list?.length) return false;
  const k = `${p.x},${p.y},${p.z}`;
  let live = false;
  for (const e of list) { if (e.until <= now) continue; live = true; if (e.cells.has(k)) return true; }
  if (!live) bot._keepOut = [];
  return false;
}

// A block to fill the water with, from the pockets (the span's list).
function fillBlock(bot) {
  const PLACEABLE = /^(dirt|cobblestone|cobbled_deepslate|netherrack|andesite|diorite|granite|tuff|stone|deepslate|sandstone|gravel|sand|.*_planks|.*_log)$/;
  return (bot.inventory?.items?.() || []).find(i => PLACEABLE.test(i.name)) || null;
}

// The ways the air question adds when the water is a trap: each { description, run }.
// `land` is the bank cell swim_to_land goes to (or null); `boat` is boats.boatFromWater's caller or null.
function ways(bot, task, goal, save, t, { land = null, boat = null } = {}) {
  const out = {};
  const now = Date.now();
  // A way chosen in the last minute is not offered again (note 2189): fill_it_from_the_bank was chosen four times in
  // a second on 25595, none of them with time to fill anything.
  const picked = key => t.lastPick?.key === key && now - t.lastPick.at < 60000;
  const mark = (key, run) => async () => { t.lastPick = { key, at: Date.now() }; save?.(); return run(); };
  if (!(t.keptOut > now - KEEP_OUT_MS)) {
    if (!picked('keep_out_of_walk')) out.keep_out_of_walk = { description: `Swim to the bank as swim to land does, and keep this water and the cells round it (a block each way, two down and three up) out of every walk for ten minutes: the pathfinder goes round it or finds no route, and the step under way asks again where it does. Costs the swim's half second and whatever the way round adds.`,
      run: async () => {
        keepOut(bot, goal, t); save?.();
        bot.chat?.('That water keeps taking me. Going round it from now on.');
        if (land) { const { goals } = require('mineflayer-pathfinder'); await require('./skills').navigate(bot, task, new goals.GoalNear(land.x, land.y, land.z, 1), { timeoutMs: 15000, stallMs: 5000 }); }
        return true;
      } };
  }
  const block = fillBlock(bot);
  if (block && land && !picked('fill_it_from_the_bank')) {
    out.fill_it_from_the_bank = { description: `Swim to the bank, then fill this water's cell at (${t.x}, ${t.y}, ${t.z}) with a ${block.name.replaceAll('_', ' ')} (${block.count} carried), placed on the block under it from the bank: the hole is gone for good and the walk goes over it. About three seconds; fails where the bank does not reach the cell (the block is then kept).`,
      run: async () => {
        const { goals } = require('mineflayer-pathfinder'), { Vec3 } = require('vec3');
        await require('./skills').navigate(bot, task, new goals.GoalNear(land.x, land.y, land.z, 1), { timeoutMs: 15000, stallMs: 5000 });
        task.check();
        const cell = new Vec3(t.x, t.y, t.z);
        // The water's own cell filled, then the one above it where the body sank two deep.
        for (const c of [cell, cell.offset(0, 1, 0)]) {
          const below = bot.blockAt(c.offset(0, -1, 0)), there = bot.blockAt(c);
          if (!there || !/water/.test(there.name)) continue;
          if (!below || below.boundingBox !== 'block') continue;
          if (c.offset(0.5, 0.5, 0.5).distanceTo(bot.entity.position.offset(0, 1.62, 0)) > 4.5) { bot._bodyWayWhy = `the cell at (${c.x}, ${c.y}, ${c.z}) is out of reach from the bank`; return false; }
          const item = fillBlock(bot); if (!item) return false;
          await bot.equip(item, 'hand');
          await bot.lookAt(c.offset(0.5, -0.5, 0.5), true);
          try { await bot.placeBlock(below, new Vec3(0, 1, 0)); } catch (err) { bot._bodyWayWhy = `the block would not go in: ${err.message}`; return false; }
        }
        t.filled = Date.now(); save?.();
        bot.chat?.('Filled that hole. It will not take me again.');
        return true;
      } };
  }
  if (boat && !picked('boat_out')) out.boat_out = { description: boat.description, run: boat.run };
  for (const k of Object.keys(out)) out[k].run = mark(k, out[k].run);
  return out;
}

module.exports = { note, here, says, keepOut, refused, ways, fillBlock, KEEP_OUT_MS, WINDOW_MS };
