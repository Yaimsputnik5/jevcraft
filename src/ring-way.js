'use strict';
// The way to a far End portal ring across water the walk cannot cross (note
// 2191): the stronghold-stage trial mid-243-ma-end-3-stronghold-6 (25598,
// 2026-10-26 10:18 to 10:30Z), eleven eyes carried, its ring 210 blocks west
// under the sea, no boat and no wood for one, walked a leg into the water,
// was swum back to the bank by the body's rule, walked in again: forty
// blocks east and west for twelve minutes, the stall question answering
// none good four times. The walk's own code had decided (note 1168) that a
// tunnel dug from this far off was not the stair's turn and returned to walk
// again. Now the ring's far way is Jev's: swim straight at it, the head kept
// up, in legs of a minute (a swimmer about two blocks a second; the water
// ahead and the drowned said), or dig a tunnel straight at it through the
// rock, down to its level, two blocks a cell (about three seconds a cell
// with a pickaxe), the pickaxe's uses against the cells said. Held ten
// minutes once chosen.
const { Vec3 } = require('vec3');
const HOLD_MS = 10 * 60000, SWIM_BPS = 2, TUNNEL_SECONDS_A_CELL = 3, LEG_MS = 60000;

function facts(bot, goal, center, { flat }) {
  const here = bot.entity.position;
  const dx = center.x + .5 - here.x, dz = center.z + .5 - here.z;
  const heading = (Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8;
  let water = null, ray = [];
  try { const ex = require('./exploration'); ray = ex.surfaceRay(bot, heading, { reach: 128, step: 4 }); water = ex.waterAhead(ray); } catch (_) { water = null; }
  const down = Math.round(here.y - center.y);
  const picks = (bot.inventory?.items?.() || []).filter(i => /_pickaxe$/.test(i.name));
  let uses = 0; try { uses = picks.reduce((n, i) => n + Math.max(0, (bot.registry.itemsByName[i.name]?.maxDurability || 0) - (i.durabilityUsed || 0)), 0); } catch (_) { uses = 0; }
  const cells = Math.round(flat), digs = cells * 2 + Math.max(0, down) ;
  return { flat: Math.round(flat), down, heading, water, inWater: /water/.test(bot.blockAt(here.floored())?.name || ''), picks: picks.length, uses, cells, digs,
    swimSeconds: water ? Math.round(((water.landAt ? water.to : 128) - Math.max(0, water.from)) / SWIM_BPS) : null,
    tunnelSeconds: cells * TUNNEL_SECONDS_A_CELL, health: bot.health, food: bot.food };
}

function says(f) {
  const w = f.water;
  const waterSays = !w ? 'no water lies on the ground along the line to the ring within 128 blocks' : `water lies across the line to the ring from ${w.from} blocks${w.landAt ? ` to ${w.to}, land again at ${w.landAt.d}` : ' to the edge of what is loaded (128), no land seen past it'}`;
  return `The ring is ${f.flat} blocks off across the ground and ${f.down > 0 ? `${f.down} down` : `${-f.down} up`}. ${waterSays}.${f.inWater ? ' The bot is in the water now.' : ''} Carried: ${f.picks} pickaxe${f.picks === 1 ? '' : 's'} with ${f.uses} digs left in all.`;
}

function tree(f) {
  const out = {};
  const w = f.water;
  out.swim_on = { description: `Swim straight at the ring along its line, the head kept up, a minute at a time until the water ends or the ring is near: ${w ? `${w.landAt ? `${w.to - w.from + 4} blocks of water, about ${f.swimSeconds} seconds at a swimmer's two blocks a second` : `at least ${128 - w.from} blocks of water, about ${f.swimSeconds} seconds and more`}` : 'no water seen ahead: the walk goes on'}; drowned live in the water and come up after a swimmer (9 of the 41 Overworld deaths of the six hours to 2026-10-05 21:45Z); a drowned's blow is 3, a thrown trident 8; health ${f.health}, hunger ${f.food}. On the far shore the walk is the ordinary walk again.` };
  if (f.picks) out.tunnel_under = { description: `Dig a tunnel straight at the ring through the rock, two high, down to its level: about ${f.cells} cells and ${f.digs} digs (about ${Math.round(f.tunnelSeconds / 60)} minutes at three seconds a cell), ${f.uses} digs left in the pickaxe${f.picks === 1 ? '' : 's'} carried${f.uses < f.digs ? ` (short by ${f.digs - f.uses}: the tunnel stops there unless another is made)` : ''}; no water, drowned or night on the way, the stone dug carried along, and the tunnel ends beside the ring's room.` };
  return out;
}

// Asked (or the held answer taken) and carried out. -> true when a way ran, false when none was chosen.
async function askFarWay(bot, task, goal, save, actions, { center, flat, client }) {
  const ep = goal.endPortal ||= {};
  const now = Date.now();
  const f = facts(bot, goal, center, { flat });
  let pick = ep.farWay && now - ep.farWay.at < HOLD_MS ? ep.farWay.pick : null;
  const t = tree(f);
  if (pick && !t[pick]) pick = null;
  if (!pick) {
    if (!client) return false;
    const decision = await require('./decisions').decide('ring_way_far', { client, bot, task, goal, save, tree: t, state: { ring: says(f), health: bot.health, food: bot.food, eyesCarried: (bot.inventory?.items?.() || []).filter(i => i.name === 'ender_eye').reduce((n, i) => n + i.count, 0) } });
    if (decision.stale) return false;
    pick = decision.path.at(-1);
    if (!t[pick]) return false;
    ep.farWay = { pick, at: now }; save();
    bot.chat?.(pick === 'swim_on' ? 'Swimming for the stronghold.' : 'Digging straight for the stronghold.');
  }
  const target = new Vec3(center.x + .5, center.y, center.z + .5);
  if (pick === 'tunnel_under') {
    goal.step = { ...(goal.step || {}), way: 'a tunnel dug straight at the ring', farWay: 'tunnel_under' }; save();
    try { await require('./bridging').tunnelStraight(bot, task, target, { maxSteps: 96, navigate: actions.navigate, down: true }); }
    catch (err) { task.check(); if (['Cancelled', 'NeedsAir', 'NeedsSafety'].includes(err.name)) throw err; console.log(`[ring way] the tunnel stopped: ${String(err.message || err).slice(0, 160)}`); }
    return true;
  }
  // swim_on: straight along the line, a minute at a time, out of the water or near the ring.
  goal.step = { ...(goal.step || {}), way: 'a swim straight at the ring', farWay: 'swim_on' }; save();
  const { move } = require('./motion'), { checkAir } = require('./vitals'), { checkThreats } = require('./danger');
  const began = Date.now(), start = bot.entity.position.clone();
  const flatNow = () => Math.hypot(target.x - bot.entity.position.x, target.z - bot.entity.position.z);
  const inWater = () => /water/.test(bot.blockAt(bot.entity.position.floored())?.name || '');
  let stuck = 0;
  while (Date.now() - began < LEG_MS && flatNow() > 24) {
    task.check(); checkAir(bot); checkThreats(bot);
    const was = flatNow();
    await move(bot, task, { label: 'swim_to_ring', keys: ['forward', 'jump'], sneak: false, why: 'straight at the End portal ring across the water', guard: () => checkThreats(bot),
      look: new Vec3(target.x, bot.entity.position.y + 1.6, target.z), maxMs: 3000, tick: 50, until: () => flatNow() <= 24 });
    if (was - flatNow() < 1) { if (++stuck >= 3) break; } else stuck = 0;
    if (!inWater() && bot.entity.onGround && bot.entity.position.distanceTo(start) > 16) break;
  }
  console.log(`[ring way] swam ${Math.round(start.distanceTo(bot.entity.position))} blocks toward the ring in ${Math.round((Date.now() - began) / 1000)} s; ${Math.round(flatNow())} to go, ${inWater() ? 'in the water' : 'on ground'}`);
  return true;
}

module.exports = { facts, says, tree, askFarWay, HOLD_MS };
