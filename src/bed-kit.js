'use strict';
// A chest beside the bed slept in last, with a spare kit and spare armour in
// it, where no home base's chest stands by that bed (note 2029). The spare
// kit lived in the home base's stash alone (home-stash.js), and the home is
// a rung of its own, offered as one needed for nothing on the way to the
// dragon: of the four full runs on 2026-10-22, three had no home at all and
// the fourth's chest stood 233 blocks from the bed it came back to life at,
// with no armour in it; of their last ten deaths each, 8, 7, 5 and 4 were in
// no armour, most minutes after coming back to life bare (full-1, 07:37 to
// 07:40Z, four deaths at one spot). The bed moves with every night slept
// (the spawn-bed rule, notes 1944 to 1948); this chest goes beside the one
// the bot comes back to.
//
// The chest is the home stash's own machinery, given a home of one bed:
// {origin: the bed's foot, stash: goal.bedKit}. A new bed slept in elsewhere
// leaves the old chest behind (said, not walked back to).
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');
const { countOf } = require('./skills');
const { setAside, isSetAside } = require('./progress');

const NEAR_BED = 16, HOME_COVERS = 8;
const plain = p => ({ x: p.x, y: p.y, z: p.z });
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const stash = () => require('./home-stash');
const overworld = bot => /overworld/.test(String(bot.game?.dimension || 'overworld'));

// The home of one bed, or null where there is none or a home base's chest
// stands by it already.
function bedKitHome(bot, goal) {
  if (!goal || !overworld(bot) || (bot.game?.gameMode && bot.game.gameMode !== 'survival')) return null;
  const sb = bot._survivalState?.spawnBed?.foot;
  if (!sb || !Number.isFinite(sb.x)) return null;
  const h = goal.survival?.home;
  if (h?.stash?.position && d3(h.stash.position, sb) <= HOME_COVERS) return null;
  if (goal.bedKit && (!goal.bedKit.bedFoot || d3(goal.bedKit.bedFoot, sb) > 2)) delete goal.bedKit;
  return { origin: plain(sb), stash: goal.bedKit || null, bedKit: true };
}

const distanceTo = (bot, home) => { const p = bot.entity?.position; return p ? d3(p, { x: home.origin.x + 0.5, y: home.origin.y, z: home.origin.z + 0.5 }) : Infinity; };
const woodFor = bot => countOf(bot, 'chest') >= 1 || bot.inventory.items().filter(i => /_planks$/.test(i.name)).reduce((n, i) => n + i.count, 0) >= 8
  || bot.inventory.items().filter(i => /_(log|stem)$/.test(i.name)).reduce((n, i) => n + i.count, 0) >= 2;

// A cell beside the bed for the chest: open, on solid ground, not the bed.
function chestCell(bot, foot, head) {
  const bed = [foot, head].filter(Boolean);
  for (const at of bed) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = new Vec3(at.x + dx, at.y, at.z + dz);
    if (bed.some(b => b.x === c.x && b.z === c.z)) continue;
    const here = bot.blockAt(c), up = bot.blockAt(c.offset(0, 1, 0)), under = bot.blockAt(c.offset(0, -1, 0));
    if (here && up && under && here.boundingBox === 'empty' && up.boundingBox === 'empty' && under.boundingBox === 'block' && !/_bed$/.test(under.name)) return c;
  }
  return null;
}

async function placeBedChest(bot, task, goal, save, home, actions) {
  const sb = bot._survivalState?.spawnBed;
  const cell = chestCell(bot, sb.foot, sb.head);
  if (!cell) throw new Error('no open cell on solid ground beside the bed for a chest');
  // A step a call (work.js acquireStep): the planks, the table, the chest
  // each its own (note 2030). Called once, full-1 (2026-10-22 11:02:50Z)
  // chose kit_by_bed at 0.42, made the planks, and the placing found 'Need
  // more chest'.
  for (let i = 0; i < 8 && countOf(bot, 'chest') < 1; i++) { task.check(); if (await actions.acquireStep(bot, task, 'chest', 1, goal, save) === true) break; }
  if (countOf(bot, 'chest') < 1) throw new Error('the chest for beside the bed was not made');
  goal.step = { action: 'bed_kit_chest', at: plain(cell) }; save();
  await actions.navigate(bot, task, new goals.GoalNear(cell.x, cell.y, cell.z, 3), { timeoutMs: 30000, stallMs: 8000 });
  if (bot.blockAt(cell)?.name !== 'chest') await actions.place(bot, task, cell, 'chest');
  if (bot.blockAt(cell)?.name !== 'chest') throw new Error('the chest did not go beside the bed');
  goal.bedKit = { position: plain(cell), bedFoot: plain(sb.foot), placedAt: new Date().toISOString(), contents: {} };
  home.stash = goal.bedKit; save();
}

// What would go in: the kit's spares and the spare armour.
function depositsOf(bot, goal, home) {
  const s = stash();
  const moves = s.stashDeposits(bot, home, { goal }).filter(m => m.slot);
  const armour = s.spareArmour(bot, home).filter(n => countOf(bot, n) >= 1).map(n => ({ item: n, count: 1, slot: 'armour' }));
  return { moves, armour };
}

// The options at idle and at bedtime: put the chest down and stock it, stock
// it, or take the kit out of it.
function bedKitChores(bot, goal, { now = Date.now() } = {}) {
  const home = bedKitHome(bot, goal);
  if (!home || isSetAside(goal, 'bed_kit', 'chest', now)) return {};
  const far = distanceTo(bot, home);
  if (far > NEAR_BED) return {};
  const s = stash(), d = Math.round(far), out = {};
  let bare = '';
  try { bare = require('./strategy').bareDeathsSays(bot); } catch (_) { bare = ''; }
  const { moves, armour } = depositsOf(bot, goal, home);
  const what = s.describeMoves([...moves, ...armour]);
  if (!home.stash?.position) {
    if ((moves.length || armour.length) && woodFor(bot)) out.kit_by_bed = { description: `Put a chest (eight planks) beside the bed slept in, ${d} blocks off, and leave in it ${what}: a death comes back to life at that bed, and the kit is taken out of the chest there first.${bare}`,
      run: async (b, t, g, sv, a) => {
        try { await placeBedChest(b, t, g, sv, home, a); await s.stockStash(b, t, g, sv, home, a, { only: m => !!m.slot, extra: depositsOf(b, g, home).armour }); }
        catch (err) { t.check(); if (['NeedsAir', 'NeedsSafety', 'Cancelled'].includes(err.name)) throw err; setAside(g, 'bed_kit', 'chest', String(err.message || err).slice(0, 160), 10 * 60000); sv(); }
      } };
    return out;
  }
  const holds = s.describeContents(home.stash.contents || {}) || 'nothing yet';
  if (moves.length || armour.length) out.stock_bed_kit = { description: `Put spares in the chest beside the bed slept in (${d} blocks off): ${what}. It holds ${holds}.${bare}`,
    run: (b, t, g, sv, a) => s.stockStash(b, t, g, sv, home, a, { only: m => !!m.slot, extra: depositsOf(b, g, home).armour }) };
  const takes = s.stashWithdrawals(bot, home, []);
  if (takes.length) out.take_bed_kit = { description: `Take ${s.describeMoves(takes)} out of the chest beside the bed slept in (${d} blocks off): the kit left there for coming back to life bare. It holds ${holds}.`,
    run: (b, t, g, sv, a) => s.restockFromStash(b, t, g, sv, home, a, []) };
  return out;
}

module.exports = { bedKitHome, bedKitChores, chestCell, NEAR_BED };
