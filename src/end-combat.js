'use strict';
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');
const { dimension } = require('./game-progress');
const { countOf, surveyRoute } = require('./skills');
const { dryStanding } = require('./mining-access');
const { safeFromHostiles, hostileEntities } = require('./danger');
const { checkAir, maintainVitals } = require('./vitals');
const { aimAtEntity, shootBow, throwAt, THROWN, THROWABLE } = require('./projectiles');
// The dragon's head through the armour worn (Normal: 10 before armour), and
// what the arena's drill of a bare kit came to under it (note 1343).
// Iron bars about a crystal: one of the two caged pillars (note 1343).
// What the blows at crystals took from the bot (note 1414): this fight's
// own, then the arena's measure. -> string
const PUNCH_RECORD = { under: 'the arena\'s drill of 2026-10-13 (05:08Z, full iron, shield raised) took 0.4', top: 'the arena\'s drills of 2026-10-13 (03:47 to 04:02Z, full iron, 20 health) took 14.5, 14.6 and 14.6 a crystal with no shield up, and 0 with the shield raised for the blow (04:12Z; the shield is raised where one is carried)' };
function punchRecordSays(state, under = true) {
  const own = (state?.punches || []).filter(p => p.exploded && p.under === under);
  const mine = own.length ? `this fight's ${own.length} such blow${own.length === 1 ? '' : 's'} took ${own.map(p => p.took).join(', ')} health` : '';
  return `The crystal bursts when struck, a blast of power six (a creeper's is three) centred on the top face of its bedrock: struck at its own height from beside it, standing, the arena's drill of 2026-10-06 (05:46Z, full iron) took 11.8; ${under ? 'from two blocks under the bedrock, beside the pillar' : 'crouched on the top two blocks from the bedrock'}, ${under ? PUNCH_RECORD.under : PUNCH_RECORD.top}${mine ? `; ${mine}` : ''}.`;
}
function caged(bot, crystal) {
  try { const c = crystal.position.floored(); for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 3; dy++) for (let dz = -2; dz <= 2; dz++) if (bot.blockAt(c.offset(dx, dy, dz))?.name === 'iron_bars') return true; } catch (_) {}
  return false;
}
// The perched dragon's breath (note 1344): sitting and flaming (phase 5)
// it lays its breath on the ground before its head, Instant Damage of 6 a
// time that armour does not lessen. The arena's drill of 2026-10-06
// (04:25Z), full iron at 20 health, walked to four blocks from it to "gain
// a future attack opportunity" and died there.
function breathSays(bot, dragon, to) {
  try {
    if (!dragon || metadata(bot, dragon, 'phase') !== 5) return {};
    const head = dragon.position; const d = Math.hypot(to.x - head.x, to.z - head.z);
    return d <= 8 ? { intoTheBreath: `ends ${Math.round(d)} blocks from the perched dragon while it breathes: its breath lies on the ground before its head, Instant Damage of 6 a time that armour does not lessen; the drill's bot in full iron at 20 health walked in there and died` } : {};
  } catch (_) { return {}; }
}
const blocksCarriedName = bot => { const SCAFF = ['cobblestone', 'end_stone', 'netherrack', 'dirt', 'stone', 'cobbled_deepslate', 'andesite', 'granite', 'diorite', 'oak_planks', 'spruce_planks', 'birch_planks']; return (bot.inventory?.items() || []).map(i => i.name).find(n => SCAFF.includes(n)) || null; };
function blocksCarried(bot) {
  return bot.inventory.items().filter(i => /^(cobblestone|cobbled_deepslate|end_stone|netherrack|dirt|stone|blackstone|deepslate|andesite|diorite|granite|tuff|obsidian)$/.test(i.name)).reduce((n, i) => n + i.count, 0);
}
function headHit(bot) {
  try { const ce = require('./combat-estimate'); const a = ce.armourOf([5, 6, 7, 8].map(i => bot.inventory?.slots?.[i]?.name).filter(Boolean)); return Math.round(ce.afterArmour(10, a) * 10) / 10; } catch (_) { return 10; }
}
function drillSays(bot) {
  return [5, 6, 7, 8].some(i => bot.inventory?.slots?.[i]) ? '' : 'the arena\'s drill of 2026-10-06, nothing worn and a stone sword, ran under the perched head at 14.9 health and died there';
}
const { decide } = require('./decisions');

// The dragon_fight question lives in decisions/combat.js (no fallback:
// Jev not reachable, the bot holds, note 707).
const { canStrike, defendNearby, raiseShield, lowerShield } = require('./combat');
const { durable, carriedEquipment } = require('./mob-policy');
const { fallDanger, recoverFall } = require('./fall-recovery');
const { cloudRadius, hazardDistance, endEmergency, checkEndEmergency, evadeDragon, dragonThreat, breathThreat } = require('./end-safety');
const { endDecisionState } = require('./decisions/end-state');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const blocked = message => Object.assign(new Error(message), { name: 'Blocked' });
const vector = p => new Vec3(p.x, p.y, p.z);
const live = (bot, e) => e && e.isValid !== false && bot.entities[e.id] === e;
function metadata(bot, entity, name) {
  const index = bot.registry.entitiesByName[entity.name]?.metadataKeys?.indexOf(name);
  return index >= 0 ? entity.metadata?.[index] : undefined;
}
const perched = (bot, dragon) => [5, 6, 7].includes(metadata(bot, dragon, 'phase'));
const crystalKey = entity => `${entity.position.x},${entity.position.y},${entity.position.z}`;
function repeatedCrystalMiss(state, target, position) {
  return (state.shots || []).filter(s => s.outcome === 'target_remains' && s.targetPosition && s.origin &&
    vector(s.targetPosition).distanceTo(target.position) < .1 && vector(s.origin).offset(0, -1.52, 0).distanceTo(position) < 4).length >= 2;
}
function observeArena(bot, state, now = Date.now()) {
  const crystals = Object.values(bot.entities).filter(e => live(bot, e) && e.name === 'end_crystal');
  const known = state.knownCrystals ||= {}, seen = new Set(crystals.map(crystalKey));
  for (const e of crystals) known[crystalKey(e)] = { id: e.id, position: { ...e.position }, status: 'observed', lastSeenAt: now };
  for (const [key, entry] of Object.entries(known)) {
    if (seen.has(key) || ['destroyed', 'absent_on_revisit'].includes(entry.status)) continue;
    // Entity tracking range is not world destruction. Keep missing targets
    // until a close, loaded revisit has had time to receive entity packets.
    entry.status = 'unresolved';
    const p = vector(entry.position), close = Math.hypot(p.x - bot.entity.position.x, p.z - bot.entity.position.z) < 24;
    if (close && bot.blockAt(p)) {
      entry.absentSince ??= now;
      if (now - entry.absentSince >= 1500) { entry.status = 'absent_on_revisit'; entry.revisitedAt = now; }
    } else delete entry.absentSince;
  }
  const dragon = Object.values(bot.entities).find(e => live(bot, e) && e.name === 'ender_dragon');
  if (dragon) {
    state.lastDragon = { position: { ...dragon.position }, phase: metadata(bot, dragon, 'phase'), at: now };
    if (perched(bot, dragon)) { state.arenaCenter = { ...dragon.position }; bot._arenaCenter = { ...dragon.position }; }
  }
  return crystals;
}

function endHazards(bot) {
  const hazards = Object.values(bot.entities).filter(e => live(bot, e) && (['end_crystal', 'area_effect_cloud', 'dragon_fireball'].includes(e.name) ||
    e.name === 'ender_dragon' && !perched(bot, e) && metadata(bot, e, 'phase') !== 9))
    .map(e => ({ entity: e, radius: e.name === 'end_crystal' ? 12 : e.name === 'area_effect_cloud' ?
      cloudRadius(bot, e) : e.name === 'ender_dragon' ? ([2, 3].includes(metadata(bot, e, 'phase')) ? 10 : 16) : 6 }));
  // The dragon's body at its perch (note 1544): sitting on the fountain, or
  // coming down to it, its body and wings strike what stands within about
  // eight of the fountain's middle, 4.9 a blow. A walk ends no nearer than
  // that, unless it is the run under the head. 25588 (dragon-95, 2026-10-14
  // 00:12Z, four crystals broken, 14.3 health) walked toward the fountain in
  // four moves as the dragon came down, ended 7.6 from its middle, and took
  // three blows in 1.3 seconds, 14.3 to 7.9 to 1.5 to none.
  if (!bot._underHeadRun) for (const e of Object.values(bot.entities)) {
    if (e.name !== 'ender_dragon' || !live(bot, e)) continue;
    const phase = metadata(bot, e, 'phase');
    const spot = perched(bot, e) ? e.position : [2, 3].includes(phase) && bot._arenaCenter ? vector(bot._arenaCenter) : null;
    // Only from outside: the body already within the eight (under the head for the sword, note 1156) is not 'unsafe' for it; no walk goes in.
    if (spot && Math.hypot(spot.x - bot.entity.position.x, spot.z - bot.entity.position.z) > 8) hazards.push({ entity: { name: 'ender_dragon_body', position: spot, isValid: true }, radius: 8 });
  }
  return hazards;
}
// The mobs a place in the End is judged by: the dragon is not one of them
// (note 1156). Its flight, its charge and its breath are the hazards'
// own (endHazards, end-safety.js dragonThreat), and perched it is what the
// sword came for: counted as a mob within twenty blocks, it made the
// ground under its own head unsafe. The rehearsal of 2026-10-04 (02:25 to
// 02:33Z) ran under the perched head nine times: five too late, four
// "head moved out of reach" with no swing, the last "head 4.1 blocks off
// ... safe false (ender_dragon 9), strike in reach, not offered".
const endMobs = bot => hostileEntities(bot, 64).filter(e => e.name !== 'ender_dragon');
function safeEndPoint(bot, p, hazards = endHazards(bot)) {
  // Navigation allows retreat from an already close mob. A place to stand,
  // draw or heal must satisfy the full buffer, not that retreat exception.
  const mobs = endMobs(bot);
  return safeFromHostiles(bot, p, mobs) && mobs.every(e => p.distanceTo(e.position) >= 20) &&
    hazards.every(({ entity, radius }) => hazardDistance(p, entity) > radius);
}

// Water answers an enderman: one that touches it is hurt and teleports
// away, and a source poured at the feet spreads a ring of flowing water it
// has to cross to strike. The End kit carries a bucket for this. Poured
// only on solid ground into the bot's own open cell; taken back once no
// turned mob is near, so the bucket is there for the next one.
async function pourAtFeet(bot, check, { urgent = false } = {}) {
  const bucket = bot.inventory.items().find(i => i.name === 'water_bucket');
  // One bucket stays full for a knocked-back landing, unless the enderman is
  // at arm's length (note 1457): 25588 (dragon-37, 2026-10-13 11:23Z, full
  // iron, a diamond sword, crystals 12 and 81 broken) had one bucket left
  // and an enderman at 3 blocks, poured nothing, and was dead in three
  // seconds, 15 to none, about 4 a blow through the iron. The water is
  // taken back once the enderman is gone.
  if (!bucket || (countOf(bot, 'water_bucket') < 2 && !urgent)) return null;
  const feet = bot.entity.position.floored(), below = feet.offset(0, -1, 0);
  if (bot.blockAt(below)?.boundingBox !== 'block' || bot.blockAt(feet)?.name !== 'air') return null;
  await bot.equip(bucket, 'hand'); check();
  await bot.lookAt(below.offset(.5, 1, .5), true); await sleep(100);
  bot.activateItem();
  for (let n = 0; n < 20; n++) { check(); if (bot.blockAt(feet)?.name === 'water') return feet; await sleep(50); }
  return null;
}
async function takeWaterBack(bot, check, at) {
  const p = vector(at), bucket = bot.inventory.items().find(i => i.name === 'bucket');
  if (!bucket || bot.blockAt(p)?.name !== 'water' || bot.entity.position.distanceTo(p.offset(.5, .5, .5)) > 4) return false;
  const before = countOf(bot, 'water_bucket');
  await bot.equip(bucket, 'hand'); check();
  await bot.lookAt(p.offset(.5, .9, .5), true);
  bot.activateItem();
  for (let n = 0; n < 20; n++) { check(); if (countOf(bot, 'water_bucket') > before) return true; await sleep(50); }
  return false;
}

// How near the island's edge a point is: the nearest column within `reach`
// with nothing under it for forty blocks, the void. And the endermen near
// the straight line to it. Said with each move (the decision audit,
// 2026-09-25): a knockback at the edge is the whole run.
function voidEdge(bot, p, reach = 8) {
  for (let r = 1; r <= reach; r++) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = Math.floor(p.x) + dx * r, z = Math.floor(p.z) + dz * r;
      let floor = false, loaded = true;
      for (let y = Math.floor(p.y); y >= Math.floor(p.y) - 40; y--) {
        const b = bot.blockAt(new Vec3(x, y, z));
        if (!b) { loaded = false; break; }
        if (b.boundingBox === 'block') { floor = true; break; }
      }
      if (loaded && !floor) return r;
    }
  }
  return null;
}
function endermenNearRoute(bot, from, to, width = 6) {
  const d = to.minus(from), len2 = d.dot(d) || 1;
  return Object.values(bot.entities || {}).filter(e => e.name === 'enderman' && live(bot, e) && e.position).filter(e => {
    const t = Math.max(0, Math.min(1, e.position.minus(from).dot(d) / len2));
    return e.position.distanceTo(from.plus(d.scaled(t))) <= width;
  }).length;
}

// How near the straight line of a move passes the dragon, across the
// ground (note 1407): a perched dragon's body and wings hurt and throw what
// comes close. The dragon stage of 2026-10-07 (25588, 21:04:01Z), waiting
// sixteen blocks from the perch, took an escape to the far side of the
// fountain, offered with the endermen near its line and not the dragon,
// passed ten blocks from the perched dragon, was hit twice and thrown, and
// died.
function dragonNearRoute(dragon, from, to) {
  if (!dragon?.position) return undefined;
  const flat = v => new Vec3(v.x, 0, v.z), a = flat(from), d = flat(to).minus(a), len2 = d.dot(d) || 1, p = flat(dragon.position);
  const t = Math.max(0, Math.min(1, p.minus(a).dot(d) / len2));
  return Math.round(p.distanceTo(a.plus(d.scaled(t))));
}

// Why a point is not safe, for the record when nothing can be done.
function unsafeBecause(bot, p, hazards = endHazards(bot)) {
  const out = [];
  if (!safeFromHostiles(bot, p, endMobs(bot))) out.push('hostile path');
  for (const e of endMobs(bot)) if (p.distanceTo(e.position) < 20) out.push(`${e.name} ${Math.round(p.distanceTo(e.position))}`);
  for (const { entity, radius } of hazards) if (hazardDistance(p, entity) <= radius) out.push(`${entity.name} ${Math.round(hazardDistance(p, entity))}<=${radius}`);
  return out;
}

// The server assigns the dragon's eight part ids immediately after its root.
// In a stationary sitting phase the head is 6.5 blocks forward and one below
// the root. Flying head positions additionally use server flight history, so
// never manufacture a melee target for a moving/flying dragon.
function perchedHead(bot, dragon) {
  if (![6, 7].includes(metadata(bot, dragon, 'phase'))) return null;
  return { id: dragon.id + 1, name: 'ender_dragon_head', width: 1, height: 1, isValid: true,
    position: dragon.position.offset(Math.sin(dragon.yaw) * 6.5, -1, Math.cos(dragon.yaw) * 6.5) };
}

function arenaMovement(bot, center) {
  const movement = bot.pathfinder.movements, start = bot.entity.position.clone();
  const previous = { canDig: movement.canDig, blocksCantBreak: movement.blocksCantBreak, allow1by1towers: movement.allow1by1towers,
    allowSprinting: movement.allowSprinting, scafoldingBlocks: movement.scafoldingBlocks, allowedPosition: movement.allowedPosition };
  const cantBreak = new Set(movement.blocksCantBreak);
  if (carriedEquipment(bot).some(i => /_pickaxe$/.test(i.name))) cantBreak.delete(bot.registry.blocksByName.end_stone.id);
  // Receding from an already close cloud/crystal is permitted; entering its
  // danger radius from outside is not. Compare hazards with the live position:
  // a new cloud or knockback can put us closer than the original route start.
  // A stale distance would forbid even the first step back out of danger.
  // Not the island's rim (note 1450): a cell of the island's own stone with
  // the void beside it is no step of any walk; a span's cell (cobblestone,
  // the bot's own) is. 25588 (dragon-30, 2026-10-13 09:53Z, full iron) took
  // a walk to ground four blocks off along the eastern slope, the path went
  // down the rim at (48, 34, -13) and over, and it fell out of the world;
  // dragon-19 (07:56Z) went over the same rim at a run.
  const { deepBeside } = require('./end-safety');
  // And three cells back from it (note 1467): the island's eastern
  // underside slopes from 36 to 29 and over, every cell of it with a floor
  // beside, and four trials went off it at (46 to 52, 27 to 32, -24 to -16):
  // dragon-19, 30, 41 and 46 (2026-10-13), the last at full health on a walk
  // to ground five blocks off. A cell with the void within three is no step
  // of a walk; the bot's own cell is, to leave it.
  const own = bot.entity.position.floored();
  // The rim read once a cell (note 1578): the path search asks allowedPoint
  // of every cell it expands, and voidEdge reads up to 960 blocks a cell
  // (three rings, eight ways, forty down). The CPU profile of the arena
  // drill of 2026-10-14 05:13Z had 21 of 33 busy seconds in the search's
  // getNeighbors, 10 of them in this rim test: the event loop held two to
  // four seconds at a time, and the live runs' stalls (dragon-124's 2.2 s in
  // the breath, 126's 2.5 s at the blow) were these searches. The cells'
  // verdicts are kept a second and a half; the hazards are read once in 150 ms.
  const rimCache = new Map(); let rimCacheAt = 0, hazards = null, hazardsAt = 0;
  const rim = point => {
    const f = point.floored(), now = Date.now();
    if (now - rimCacheAt > 1500) { rimCache.clear(); rimCacheAt = now; }
    const key = `${f.x},${f.y},${f.z}`;
    if (rimCache.has(key)) return rimCache.get(key);
    const under = bot.blockAt(f.offset(0, -1, 0));
    const v = under?.name === 'end_stone' && (deepBeside(bot, point) || (!f.equals(own) && voidEdge(bot, point, 3) !== null));
    rimCache.set(key, v); return v;
  };
  const hazardsNow = () => { const now = Date.now(); if (!hazards || now - hazardsAt > 150) { hazards = endHazards(bot); hazardsAt = now; } return hazards; };
  const allowedPoint = point => {
    return point.y >= start.y - 3 && point.distanceTo(start) <= 64 && !rim(point) &&
      (!center || Math.hypot(point.x - center.x, point.z - center.z) <= Math.max(96, Math.hypot(start.x - center.x, start.z - center.z))) &&
      (!previous.allowedPosition || previous.allowedPosition(point.floored())) &&
      hazardsNow().every(({ entity, radius }) =>
        hazardDistance(point, entity) >= Math.min(radius, hazardDistance(bot.entity.position, entity) - .1));
  };
  const allowed = p => allowedPoint(vector(p).offset(.5, 0, .5));
  // Towers of one allowed with ten blocks or more carried (note 1505): the island's eastern shelf at 41 to 46 meets the top at 56 to 62 in faces of three to six blocks, and every walk from the entry platform to a pillar's foot across them ended 'navigation timed out without reaching new ground' (25588, dragon-67 to dragon-75, 2026-10-13, five to eight failed foot walks a run, two to four minutes each run on the shelf). The rim's cells are still no step of any walk.
  Object.assign(movement, { canDig: true, blocksCantBreak: cantBreak, allow1by1towers: blocksCarried(bot) >= 10, allowSprinting: false,
    scafoldingBlocks: ['cobblestone', 'end_stone'].map(n => bot.registry.itemsByName[n].id), allowedPosition: allowed });
  return { allowed, allowedPoint, restore: () => Object.assign(movement, previous) };
}

// Walled in: a block on each side of the feet and of the head, and one
// over the head. -> { of } (the wall's blocks, by name) or null.
function enclosed(bot) {
  const feet = bot.entity.position.floored(), solid = p => bot.blockAt(p)?.boundingBox === 'block';
  const round = [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dz]) => [feet.offset(dx, 0, dz), feet.offset(dx, 1, dz)]);
  if (!solid(feet.offset(0, 2, 0)) || !round.every(solid)) return null;
  const names = [...new Set([feet.offset(0, 2, 0), ...round].map(p => bot.blockAt(p).name.replaceAll('_', ' ')))];
  return { of: names.slice(0, 3).join(', ') };
}

// Off a height onto the island's ground beside it: the edge nearest the
// arena's centre whose landing is solid, in view, at most DROP_MOST blocks
// down and not past what the health carries (a fall takes its blocks less
// three; a water bucket carried breaks it, fall-recovery.js). Walked off
// upright, the landing waited for. -> true when the bot came down.
const DROP_MOST = 14, DROP_KEEPS = 8;
// Few arrows: a stack or less. By the fountain: this far from its middle, clear of the landing dragon's head (six and a half blocks before its body, ten health a touch), within the twenty it stays seated for, and a few steps from the head once it sits.
// The wait eleven blocks from the fountain, not sixteen (note 1596): the
// game's sitting dragon looks for a player within twenty blocks of ITSELF
// and leaves after five seconds without one; a wait 'about 16' from the
// fountain's middle ended at 19 to 20 (dragon-136, 2026-10-14 07:05Z, at
// 19.8), the dragon lost the player and took off four and a half seconds
// after perching, and of the seven runs under the head in runs 100 to 139
// of that day six ended 'the dragon took off before the bot was under its
// head', none struck. Within twenty it sits on: a second and a quarter
// scanning, two seconds rearing, up to ten seconds of breath, then the
// take-off; the run from eleven blocks is two seconds.
const FEW_ARROWS = 64, PERCH_RANGE = 11;
function dropOffs(bot, center = null) {
  const here = bot.entity.position, feet = here.floored();
  const solid = c => bot.blockAt(c)?.boundingBox === 'block';
  const water = (bot.inventory?.items?.() || []).some(i => i.name === 'water_bucket');
  const out = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let d = 1; d <= 6; d++) {
      const c = feet.offset(dx * d, 0, dz * d);
      if (solid(c) || solid(c.offset(0, 1, 0))) break;
      if (solid(c.offset(0, -1, 0))) continue;
      // The edge: the first cell with no floor. Its landing, and a clear fall to it.
      let land = null;
      for (let dy = 2; dy <= DROP_MOST + 1; dy++) { const b = bot.blockAt(c.offset(0, -dy, 0)); if (!b) break; if (b.boundingBox === 'block') { land = c.offset(0, -dy + 1, 0); break; } if (/lava|fire/.test(b.name)) break; }
      const fall = land ? feet.y - land.y : null;
      if (land && fall >= 4 && (water || (bot.health ?? 20) - (fall - 3) >= DROP_KEEPS)) {
        const toCenter = center ? Math.hypot(land.x - center.x, land.z - center.z) : 0;
        out.push({ edge: c, land, fall, toCenter });
      }
      break;
    }
  }
  return out.sort((a, b) => a.toCenter - b.toCenter || a.fall - b.fall);
}
// The steps a span to `to` takes: a cell a step along one axis at a time (bridging.js stepToward), and the stretch laid beyond what stands.
const spanSteps = (here, to, stretch) => stretch + Math.ceil(Math.abs(to.x - here.x) + Math.abs(to.z - here.z));

async function leaveHighGround(bot, task, goal, save, state) {
  const { fallDanger, recoverFall } = require('./fall-recovery');
  const way = dropOffs(bot, state?.arenaCenter || { x: 0, z: 0 })[0];
  if (!way) return false;
  const startY = bot.entity.position.y;
  goal.step = { action: 'leave_high_ground', edge: { x: way.edge.x, y: way.edge.y, z: way.edge.z }, land: { x: way.land.x, y: way.land.y, z: way.land.z }, fall: way.fall }; save();
  console.log(`[end] nothing to do from this height: off its edge at (${way.edge.x}, ${way.edge.y}, ${way.edge.z}) onto the ground ${way.fall} blocks down`);
  try {
    await require('./motion').move(bot, task, { label: 'leave_high_ground', keys: ['forward'], sneak: false, why: 'off a height onto the island\'s ground in view under its edge, nothing to do from up here',
      look: way.edge.offset(0.5, 1.6, 0.5), maxMs: 3000, tick: 50, until: () => !bot.entity.onGround && bot.entity.position.y < startY - 0.5 });
  } catch (err) { task.check(); }
  for (let i = 0; i < 100 && !bot.entity.onGround; i++) {
    task.check();
    if (fallDanger(bot)) { try { await recoverFall(bot, task, goal, save); } catch (err) { task.check(); } break; }
    await sleep(50);
  }
  return bot.entity.position.y <= startY - 3;
}

async function arenaRoutes(bot, task, goal, policy, focus, { throwing = false } = {}) {
  const current = bot.entity.position, visits = goal.endCombat.visits ||= {}, buckets = new Map();
  const target = focus?.position || focus;
  // A throw reaches about 28 blocks up, and less the farther out (note 1343): close in under the pillar.
  const desiredRange = focus?.name === 'end_crystal' ? (throwing ? Math.max(4, Math.min(16, 26 - (target.y - current.y))) : Math.max(24, Math.min(56, (target.y - current.y) * 1.1))) : focus?.range || 0;
  const floorOpts = { matching: ['end_stone', 'obsidian', 'bedrock'].map(n => bot.registry.blocksByName[n].id),
    maxDistance: 64, count: 256, useExtraInfo: block => {
      const p = block.position.offset(.5, 1, .5);
      return p.distanceTo(current) >= 5 && dryStanding(bot, p) && safeEndPoint(bot, p) && !require('./end-safety').deepBeside(bot, p) && voidEdge(bot, p, 3) === null;
    } };
  const floors = bot.findBlocks(floorOpts);
  // Throwing, the ground near the crystal too (note 1344): the 256 floor
  // cells nearest the bot lie within some nine blocks of it, and the
  // arena's drill of 2026-10-06 (03:46Z) was offered three walks all 43 to
  // 46 blocks from the crystal it was to close in on.
  if (throwing && target && focus?.name === 'end_crystal') {
    const seen = new Set(floors.map(b => `${b.x},${b.y},${b.z}`));
    let near = 0;
    try { for (const b of bot.findBlocks({ ...floorOpts, point: new Vec3(target.x, Math.min(target.y, current.y + 8), target.z), maxDistance: 24, count: 256 })) if (!seen.has(`${b.x},${b.y},${b.z}`)) { floors.push(b); near++; } } catch (err) { goal.endCombat.nearFloorError = String(err.message || err).slice(0, 120); }
    goal.endCombat.nearFloors = near;
  }
  for (const floor of floors) {
    const p = floor.offset(0, 1, 0), point = p.offset(.5, 0, .5);
    if (!policy.allowed(p)) continue;
    const key = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`;
    // A high caged crystal needs a shallow approach angle. Walking directly
    // underneath it makes the obsidian column obscure more of its hitbox.
    const distance = target && Math.hypot(point.x - target.x, point.z - target.z);
    // The wait by the fountain is at its ring, however often it was stood on: the visits count against a cell only where new ground is what is wanted.
    const score = (focus?.name === 'fountain' ? 0 : (visits[key] || 0) * 30) + (target ? Math.abs(distance - desiredRange) : -point.distanceTo(current)) + Math.abs(point.y - current.y);
    if (!buckets.has(key) || score < buckets.get(key).score) buckets.set(key, { p, key, score });
  }
  const routes = [], look = goal.endCombat.routeLook = { floors: floors.length, allowed: buckets.size, tried: 0, failed: {}, best: [...buckets.values()].sort((a, b) => a.score - b.score).slice(0, 3).map(c => [c.key, Math.round(c.score)]) };
  for (const candidate of [...buckets.values()].sort((a, b) => a.score - b.score).slice(0, 10)) {
    task.check();
    const p = candidate.p, destination = new goals.GoalBlock(p.x, p.y, p.z);
    // A second: from the island's edge the ground climbs nine blocks to the
    // pillars, and every quarter-second survey timed out, so the rehearsal
    // bot stood at the edge with nothing to choose.
    const route = await surveyRoute(bot, task, bot.pathfinder.movements, destination, 1000);
    look.tried++; if (route.status !== 'success') look.failed[route.status] = (look.failed[route.status] || 0) + 1; else if (!route.path.every(policy.allowed)) look.failed.notAllowed = (look.failed.notAllowed || 0) + 1;
    if (route.status === 'success' && route.path.every(policy.allowed)) routes.push({ ...candidate, destination,
      clearCrystalShot: focus?.name === 'end_crystal' && !repeatedCrystalMiss(goal.endCombat, focus, p.offset(.5, 0, .5)) &&
        !!aimAtEntity(bot, focus, new Vec3(0, 0, 0), p.offset(.5, 0, .5), throwing ? THROWN : undefined),
      targetDistance: target && p.offset(.5, 0, .5).distanceTo(target), desiredHorizontalRange: desiredRange });
    if (routes.length === 3) break;
  }
  return routes;
}

async function fightEndStep(bot, task, goal, save, actions, client, { shot = shootBow } = {}) {
  // No blow at what cannot be struck (note 1456): the server's answer to one
  // is the door ('multiplayer.disconnect.invalid_entity_attacked'), and 25588
  // was kicked twice today mid-fight (dragon-20 08:05Z, dragon-36 11:15Z),
  // the second time at the foot of its column with crystal 11 just broken.
  // Items, orbs, arrows, the breath and the fireball are never struck; a
  // crystal only by the fight's own blow (bot._crystalBlow set round it).
  if (!bot._attackGuard && typeof bot.attack === 'function') {
    const raw = bot.attack.bind(bot); bot._attackGuard = true;
    // Nor the bot itself (note 1466): the blow named by note 1463 was 'blow at player (id 50, 0 off)', the bot's own body, and the door followed at once (dragon-44, 2026-10-13 12:37Z).
    const NEVER = new Set(['item', 'experience_orb', 'arrow', 'spectral_arrow', 'trident', 'area_effect_cloud', 'dragon_fireball', 'fireball', 'small_fireball', 'shulker_bullet', 'end_crystal', 'player']);
    bot.attack = (entity, ...rest) => {
      if (!entity || entity === bot.entity || entity.id === bot.entity?.id || (NEVER.has(entity.name) && !(entity.name === 'end_crystal' && bot._crystalBlow))) { console.log(`[end combat] no blow at ${entity?.name || 'nothing'} (id ${entity?.id}): it cannot be struck`); return; }
      // Every blow named (note 1463): the server's door ('invalid_entity_attacked') was shown 25588 five times today with no blow the guard refused, the last two on the way down a column (dragon-43, 12:2xZ).
      console.log(`[end combat] blow at ${entity.name} (id ${entity.id}, ${Math.round(entity.position?.distanceTo?.(bot.entity.position) * 10) / 10} off)`);
      return raw(entity, ...rest);
    };
  }
  const check = () => {
    task.check(); checkAir(bot);
    if (dimension(bot) !== 'end' || bot.game.gameMode !== 'survival' || bot.health <= 0 || bot.isAlive === false) throw blocked('End combat requires a living Survival player in the End');
  };
  // In the End the fight is the answer to what hurts the bot: it owns every
  // tick, the survival layer has none there, and the hurt watchdog's stop
  // (survival.js: "hit with no survival response") is lifted only by the
  // survival layer's own step, or ten seconds on (note 1133). The rehearsal
  // of 2026-10-03 (23:11 to 23:22Z) had 714 of its 841 steps end at the
  // first check, "Threat nearby: something unseen at 0 blocks", each hurt
  // by the dragon stopping the fight ten seconds; it spent its budget with
  // three crystals down and 371 arrows carried.
  if (dimension(bot) === 'end') { bot._threatAbort = false; bot._threatResponseAt = Date.now(); }
  check();
  if (goal.gameProgress?.milestones.dragon_defeated) return;
  const state = goal.endCombat ||= { steps: 0, shots: [], destroyedCrystals: [], visits: {}, noProgress: 0 };
  // The budget is the bot's own choices that came to nothing, eighty in a
  // row, and it is spent once: thrown, it starts over, since the fight is
  // still there when the game comes back to it (note 1136).
  if (++state.steps > 6000 || state.noProgress >= 80) { state.steps = 0; state.noProgress = 0; save(); throw blocked('End combat exhausted its bounded action budget without verified damage, a crystal explosion or new ground'); }
  observeArena(bot, state);
  const policy = arenaMovement(bot, state.arenaCenter), oldInterrupt = task.interruptCheck;
  const started = Date.now(), start = bot.entity.position.clone(), healthBefore = bot.health;
  const dragons = Object.values(bot.entities).filter(e => live(bot, e) && e.name === 'ender_dragon');
  if (dragons.length > 1) { policy.restore(); throw blocked('More than one observed dragon; target is ambiguous'); }
  const dragon = dragons[0], beforeDragon = dragon && metadata(bot, dragon, 'health');
  let progress = false, chose = false;
  const motion = new Map();
  const moved = entity => {
    if (entity !== dragon) return;
    const now = Date.now(), previous = motion.get(entity);
    if (!previous || now - previous.at >= 40) motion.set(entity, { at: now, position: entity.position.clone(),
      velocity: previous && now - previous.at < 500 ? entity.position.minus(previous.position).scaled(50 / (now - previous.at)) : null });
  };
  const velocity = () => {
    const sample = motion.get(dragon);
    if (!sample?.velocity || Date.now() - sample.at > 500 || sample.velocity.norm() > 3) throw new Error('No recent observed dragon motion for an aimed shot');
    return sample.velocity;
  };
  bot.on('entityMoved', moved); if (dragon) moved(dragon);
  // A fall off the column caught in the air, every tick of the step (note
  // 1483): the dragon's wing pushes the body off its column with no blow
  // (note 1480), the push lifts it, so a crouch holds nothing, and the fall
  // from a column is 15 to 20 blocks onto the island. The dig under way
  // notices nothing until it ends. With a water bucket carried the water goes
  // under the body before it lands (fall-recovery.js), as it does on the
  // island's edges. 25588 (dragon-59, 15:06Z), (dragon-61, 15:37Z, to 1
  // health), (dragon-62, 15:54Z) and (dragon-63, 16:04Z), all of 2026-10-13,
  // full iron, two water buckets carried, fell 10 to 19 blocks off their
  // columns, dragon-59, 62 and 63 to their deaths, no water poured.
  const falling = () => {
    try {
      if (bot._fallRecovery || bot.entity?.onGround !== false || !fallDanger(bot) || !bot.inventory.items().some(i => i.name === 'water_bucket')) return;
      console.log(`[end combat] falling from ${bot.entity.position.floored()} at ${bot.health.toFixed(1)} health: the water bucket under the body`);
      // The bucket filled again from the pool at once (note 1485): left, the water runs down the island's slopes with the body in it. 25588 (dragon-65, 2026-10-13 16:19Z) landed in its water at (35, 58, -22) on the eastern slope, was carried five blocks east in three seconds, over the slope's edge, and from the shelf below over the rim into the void.
      recoverFall(bot, task, goal, save, { refill: true }).then(r => console.log(`[end combat] the fall ended ${r ? 'in the water' : 'dry'} at ${bot.entity.position.floored()}, health ${bot.health.toFixed(1)}`), err => console.log(`[end combat] the water under the fall: ${String(err.message || err).slice(0, 120)}`));
    } catch (_) { /* nothing to catch */ }
  };
  bot.on('physicsTick', falling);
  // The bot's own pillar under it, air on three sides at least: no walk off it.
  // By the block under the feet, not the column's recorded cell (note 1416):
  // the jumps of the climb drift, and 25588 (05:41Z) stood a cell off the
  // cell last recorded, 22 up, and was not on its pillar by the record.
  const SCAFFOLD_UNDER = /^(cobblestone|cobbled_deepslate|netherrack|dirt|stone|blackstone|deepslate|andesite|diorite|granite|tuff|end_stone)$/;
  // The record read from the ground where it is lost (note 1437): a
  // reconnect empties it, and 25588 (dragon-20, 2026-10-13 08:05Z), kicked
  // by the server and back on its own column at (-31, 92, -28) three
  // crystals in, was 'own pillar false, column undefined', held standing
  // through the dragon's pass, was knocked off and died of the fall. A
  // scaffold block under the feet, three or more of the four cells about
  // them open, and the ground four or more blocks under is the bot's column.
  const readPillar = () => {
    const f = bot.entity.position.floored(), under = bot.blockAt(f.offset(0, -1, 0));
    // High only (note 1441): the crystals' pillars top out at 76 to 103 and
    // the entry platform and its spans lie at 49; 25588 (dragon-23,
    // 2026-10-13 08:40Z) read its span's end at (90, 49, 7), the island's
    // slope four under it, as its column, and the crystal's walk was skipped.
    if (f.y < 66) return null;
    if (under?.boundingBox !== 'block' || !SCAFFOLD_UNDER.test(under.name) || under.name === 'end_stone' && f.y < 70) return null;
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (sides.filter(([dx, dz]) => bot.blockAt(f.offset(dx, -1, dz))?.boundingBox !== 'block').length < 2) return null;
    const drop = ([dx, dz]) => { for (let dy = 1; dy <= 6; dy++) if (bot.blockAt(f.offset(dx, -dy, dz))?.boundingBox === 'block') return dy - 1; return 6; };
    if (Math.max(...sides.map(drop)) < 4) return null;
    // Not a span over the void (note 1439): a column stands on something
    // within eight blocks under its block, a bridge's cell has nothing.
    // 25588 (dragon-22, 2026-10-13 08:21Z) read its own column at (94, 3),
    // the entry platform's bridge, one block over the void.
    let footing = false; for (let dy = 2; dy <= 9 && !footing; dy++) footing = bot.blockAt(f.offset(0, -dy, 0))?.boundingBox === 'block';
    if (!footing) return null;
    return { x: f.x, z: f.z, until: Date.now() + 600000, read: true };
  };
  const onOwnPillar = () => {
    if (!bot._pillarUp || bot._pillarUp.until < Date.now()) { const r = readPillar(); if (r) { bot._pillarUp = r; console.log(`[end combat] the bot's own column read from the ground under it at (${r.x}, ${r.z}), no record of it kept`); } }
    const u = bot._pillarUp, p = bot.entity.position;
    if (!u || u.until < Date.now()) return false;
    const f = p.floored();
    // The block stood on, not the cell the middle of the body is over (note
    // 1444): a body 0.6 wide at the column's edge stands on the column with
    // its middle over air. 25588 (dragon-25, 2026-10-13 09:04Z) at (30.8,
    // 77, -26.5) on its column at (31, -27) was 'not on a pillar', a stall
    // detour walked it off, and it fell 17 at 3.9 health.
    const onColumnCell = Math.hypot(u.x + .5 - p.x, u.z + .5 - p.z) <= 0.95 && bot.blockAt(new Vec3(u.x, f.y - 1, u.z))?.boundingBox === 'block';
    if (onColumnCell) f.x = u.x, f.z = u.z;
    const under = bot.blockAt(f.offset(0, -1, 0));
    // End stone under the feet below 70 is the island's, not a column's, only
    // off the column's own cell (note 1533): the climb's column is laid of
    // quarried end stone from the island's ground at 61, and 25588 (dragon-91,
    // 2026-10-13 22:54Z, four crystals broken) seven blocks up it at (-30,
    // 68, -23) was 'not on a pillar', looked for a walking escape from the
    // dragon's pass three times ('No surveyed walking escape'), took the
    // fireball's cloud there with no roof and no hold, and was knocked off.
    // On the recorded cell the drop beside the feet (below) tells the
    // column from the island's ground.
    if (under?.boundingBox !== 'block' || !SCAFFOLD_UNDER.test(under.name) || under.name === 'end_stone' && f.y < 70 && !onColumnCell) return false;
    if (Math.hypot(u.x + .5 - p.x, u.z + .5 - p.z) > 2.5) return false;
    if (u.x !== f.x || u.z !== f.z) bot._pillarUp = { ...u, x: f.x, z: f.z };
    // Two of the four cells round the feet open at least (a pillar laid up
    // against a round obsidian pillar's side has one or two of them solid),
    // and a drop of three or more off one of them (note 1458): at the
    // column's foot, in the pit the quarry left round it, the sides are
    // open and the ground a block down, and the bot is on the island, where
    // the breath is run from, not held in or dug under. 25588 (dragon-38,
    // 2026-10-13 11:30Z, full iron, crystal 11 broken) came down its column
    // to the foot at 60, was 'on its pillar' there, held for the fireball,
    // dug nothing in the cloud and died in it, 20 to none in three seconds.
    // One open side at least, not two (note 1482): the roof's post beside the
    // column (note 1454) and the obsidian make two or three solid sides at the
    // top, and 25588 (dragon-62, 2026-10-13 15:54Z, full iron, crystals 16 and
    // 83 broken) on its own column at (-10, 88, -38) was 'own pillar false',
    // 'only observe', never crouched there, and was pushed off it at 81 in
    // the breath, 19 blocks to its death.
    // Read at three depths (note 1577): the pocket's walls and posts close the cells beside the feet.
    return openDropBeside(f);
  };
  // A drop of three or more off one of the four cells beside the column, read
  // from one, two or three under the feet (the pocket's posts stand one under).
  const openDropBeside = f => {
    for (let from = 1; from <= 3; from++) {
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => bot.blockAt(f.offset(dx, -from, dz))?.boundingBox !== 'block');
      const drop = ([dx, dz]) => { for (let dy = from; dy <= from + 5; dy++) if (bot.blockAt(f.offset(dx, -dy, dz))?.boundingBox === 'block') return dy - from; return 6; };
      if (sides.length && Math.max(...sides.map(drop)) >= 3) return true;
    }
    return false;
  };
  // The column's blocks under the feet, up to six.
  const columnDepth = () => { const f = bot.entity.position.floored(); let n = 0; while (n < 6 && SCAFFOLD_UNDER.test(bot.blockAt(f.offset(0, -1 - n, 0))?.name || '') && !(bot.blockAt(f.offset(0, -1 - n, 0))?.name === 'end_stone' && f.y - 1 - n < 66 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => bot.blockAt(f.offset(dx, -2 - n, dz))?.boundingBox === 'block'))) n++; return n; };
  // The hole by the fountain (note 1592): two deep, the body in it out of the
  // dragon's wings and under the breath's cloud; out of it is two blocks laid.
  const holeHere = () => { const f = bot.entity.position.floored(); const solidAt = c => bot.blockAt(c)?.boundingBox === 'block'; return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => solidAt(f.offset(dx, 0, dz)) && solidAt(f.offset(dx, 1, dz))) && solidAt(f.offset(0, -1, 0)) && !solidAt(f.offset(0, 2, 0)); };
  const outOfTheHole = async () => {
    if (!holeHere()) return true;
    const from = Math.floor(bot.entity.position.y);
    try { await require('./pillar-recovery').pillarUp(bot, task, from + 2, { dig: actions.dig, maxBlocks: 2, threats: false }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
    console.log(`[end combat] up out of the hole: ${Math.floor(bot.entity.position.y) - from} blocks up at ${bot.entity.position.floored()}`);
    return !holeHere();
  };
  // On the recorded column's own cell, the record alive, a block under the feet.  // On the recorded column's own cell, the record alive, a block under the feet.
  const onColumnCell = () => { const u = bot._pillarUp; if (!u || u.until < Date.now()) return false; const f = bot.entity.position.floored(); return f.x === u.x && f.z === u.z && bot.blockAt(f.offset(0, -1, 0))?.boundingBox === 'block'; };
  // The breath's cloud under the feet (note 1576): a cloud lies half a block
  // deep where the fireball burst and lasts about thirty seconds, and a body
  // two blocks up is out of it. The dig down ends in it: 25588 (dragon-119,
  // 2026-10-14 03:53Z) went two up out of the cloud at (48, 50, -27), 20 to
  // 14, was asked 'observe or pillar_down' with no word of the cloud, took
  // pillar_down at 0.55, dug back down into it and died in three seconds, 15
  // to 9 to 4 to none; dragon-116 and 123 the same by the hold's own way down.
  const cloudUnderfoot = (blocks = 3) => {
    const p = bot.entity.position;
    return Object.values(bot.entities).find(e => e.name === 'area_effect_cloud' && e.isValid !== false && p.y - e.position.y >= 0.5 && p.y - e.position.y <= blocks + 0.5 && Math.hypot(p.x - e.position.x, p.z - e.position.z) <= cloudRadius(bot, e) + 0.3) || null;
  };
  const cloudUnderfootSays = c => c ? `the breath's cloud lies ${Math.round((bot.entity.position.y - c.position.y) * 10) / 10} blocks below the feet, ${Math.round(cloudRadius(bot, c) * 10) / 10} wide: a dig down ends in it, and a cloud lasts about thirty seconds and takes six a second` : null;
  // On an obsidian pillar's top (not the bot's own column): the top is a
  // small flat place high over the island, with the bot's column at its edge.
  const onObsidianTop = () => { const f = bot.entity.position.floored(); return bot.blockAt(f.offset(0, -1, 0))?.name === 'obsidian' && !!bot._pillarUp && Math.hypot(bot._pillarUp.x + .5 - bot.entity.position.x, bot._pillarUp.z + .5 - bot.entity.position.z) <= 12; };
  // Back onto the bot's own column at a crouch: the pathfinder first, then a
  // straight walk; said in the log either way.
  const backToColumn = async () => {
    const u = bot._pillarUp; if (!u) return false;
    const col = new Vec3(u.x + .5, bot.entity.position.y, u.z + .5), toCol = () => Math.hypot(col.x - bot.entity.position.x, col.z - bot.entity.position.z);
    if (toCol() < 0.2 && Math.floor(bot.entity.position.x) === u.x && Math.floor(bot.entity.position.z) === u.z) return true;
    // No pathfinder walk on an obsidian top (note 1476): crouched steps only,
    // which cannot leave an edge. 25588 (dragon-57, 2026-10-13 14:45Z, full
    // iron, crystal 94 broken on the tallest top at 103) was walked past its
    // column and off the far edge by the walk back, 42 blocks to its death.
    const underName = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))?.name || '';
    if (!/^(obsidian|bedrock|iron_bars)$/.test(underName)) {
      try { await actions.navigate(bot, task, new goals.GoalBlock(u.x, Math.floor(bot.entity.position.y), u.z), { timeoutMs: 10000, stallMs: 3000 }); }
      catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
    }
    // Centred on the column's cell (the dig is from under the feet): a stand
    // at its edge, 0.45 off, had obsidian under the feet and dug nothing
    // (the drill of 2026-10-13, 04:20Z).
    if (toCol() >= 0.2) {
      try {
        if (typeof bot.lookAt === 'function') await bot.lookAt(col.offset(0, 1.6, 0), true);
        await require('./motion').move(bot, { check, get cancelled() { return task.cancelled; }, label: task.label }, { label: 'back_to_column', keys: ['forward'], sneak: true,
          why: 'back onto the bot\'s own pillar, the way down', look: col.offset(0, 1.6, 0), maxMs: 6000, tick: 50, until: () => toCol() < 0.2 });
        // The column's top a block over the obsidian (the climb overshoots by
        // one): stepped up to with a jump. The drill of 2026-10-13 (04:28Z)
        // stopped 0.7 off, against its side.
        if (toCol() >= 0.2) await require('./motion').move(bot, { check, get cancelled() { return task.cancelled; }, label: task.label }, { label: 'back_to_column_up', keys: ['forward', 'jump'], sneak: false,
          why: 'up onto the column\'s top', look: col.offset(0, 1.6, 0), maxMs: 4000, tick: 50, until: () => toCol() < 0.2 });
      } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
    }
    const back = toCol() < 0.35 && Math.floor(bot.entity.position.x) === u.x && Math.floor(bot.entity.position.z) === u.z;
    console.log(`[end combat] back to the column at (${u.x}, ${u.z}): ${back ? 'there' : `not reached, ${Math.round(toCol() * 10) / 10} off`}`);
    return back;
  };
  // Down the bot's own column a block at a time from under the feet.
  // Centred on the column's cell to a tenth of a block: the body is 0.6
  // wide, and at 0.2 off toward the obsidian it still stands on its lip
  // when the block under it is dug (the drills of 2026-10-13, 04:52 and
  // 05:02Z, one dug and no drop). Short bursts of the forward key at a
  // crouch, the look set to the column's middle each time.
  const centreOnColumn = async (tolerance = 0.1) => {
    const u = bot._pillarUp; if (!u) return false;
    const col = () => new Vec3(u.x + .5, bot.entity.position.y, u.z + .5), off = () => Math.hypot(col().x - bot.entity.position.x, col().z - bot.entity.position.z);
    for (let i = 0; i < 24 && off() > tolerance; i++) {
      check();
      if (typeof bot.lookAt === 'function') await bot.lookAt(col().offset(0, 1.6, 0), true);
      bot.setControlState?.('sneak', true); bot.setControlState?.('forward', true);
      await sleep(off() > 0.4 ? 120 : 60);
      bot.setControlState?.('forward', false);
      await sleep(80);
    }
    bot.setControlState?.('sneak', false);
    return off() <= 0.15;
  };
  const digDownColumn = async ({ limit = 64 } = {}) => {
    let passes = 0, aborts = 0;
    const digFromY = Math.floor(bot.entity.position.y), digFromHealth = bot.health;
    // The column's blocks: what the climb lays, end stone among them (note
    // 1438): 25588 (dragon-21, 2026-10-13 08:17Z), its cobblestone gone and
    // its column laid in end stone, had the way down dig nothing at (-31, 85,
    // 26), 'end_stone under the feet', the record dropped, and stood 'only
    // observe' through 58 failed escapes, 20 to 11. On the island's own
    // ground (under 70, the cells about the feet solid) end stone is the
    // island, not the column.
    const scaffold = { test: name => SCAFFOLD_UNDER.test(name || '') && !(name === 'end_stone' && columnEnded()) };
    // Ended where the ground is, not at a height (note 1471): the island's
    // ground runs from 36 to 60, and 25588 (dragon-53, 2026-10-13 14:03Z,
    // crystal 12 broken) had its end-stone column at 69 read as the island
    // 'under 70', the record dropped, and stood 'only observe' eleven blocks
    // up. The column has ended when no open side drops three or more.
    // By the drop alone (note 1474): the roof's post beside the column and the obsidian made two solid sides, and 25588 (dragon-55, 2026-10-13 14:28Z, crystals 9 and 67 broken) had its end-stone column at 69 read as ended, 'column undefined'.
    // The column's sides read at three depths (note 1577): the pocket's posts (note 1575) close every cell beside the feet one down, and 25588 (dragon-127, 2026-10-14 05:13Z) in its pocket with the breath at its feet had 'down the column: 0 dug', the column read as ended, and died in the cloud.
    const columnEnded = () => !openDropBeside(bot.entity.position.floored());
    let n = 0;
    // In the cloud, a body within 0.45 of the middle stands wholly on the block and is dug down at once (note 1481).
    if (!await centreOnColumn(breathThreat(bot)?.name === 'area_effect_cloud' ? 0.45 : 0.1)) console.log(`[end combat] not centred on the column before the dig: ${Math.round(Math.hypot(bot._pillarUp.x + .5 - bot.entity.position.x, bot._pillarUp.z + .5 - bot.entity.position.z) * 100) / 100} off`);
    console.log(`[end combat] down the column from ${bot.entity.position.floored()}, ${bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))?.name || 'nothing'} under the feet, column ${JSON.stringify(bot._pillarUp)}`);
    for (; n < limit; n++) {
      check();
      // The dragon coming is held through before the block is dug (note
      // 1448): with the breath on the column the emergency is the cloud's,
      // the pass is never said, and a blow mid-dig throws the body off a
      // column one wide. 25588 (dragon-29, 2026-10-13 09:44Z, two crystals
      // broken in five minutes) was hit digging down out of the breath at 94,
      // 15 to 10, and fell 33 to its death. The shield stops the blow and
      // its knock; the dig goes on after.
      // Not with the breath on the body (note 1453): a hold in the cloud is 6
      // a second, and 25588 (dragon-33, 2026-10-13 10:41Z, full iron, three
      // crystals broken) held crouched in it for the dragon's pass, 17 to 11
      // to 5 to none. In the cloud the dig is the way; the pass is taken.
      if (passes < 20 && dragonThreat(bot) && !breathThreat(bot)) { passes++; if (await chargeDrop()) return; const held = await holdOnColumn(); if (held === 'cloud' && state.descent?.pick === 'water_drop' && await waterDrop()) return; n--; continue; }
      // The column's own cell, and the body centred on it again each block
      // (note 1452): a body a cell off the column after a drop or a knock
      // read air under its middle, and 25588 (dragon-33, 2026-10-13 10:31Z)
      // had its way down stop '1 dug' at (-10, 81, -37) beside its column at
      // (-10, -38).
      const u = bot._pillarUp, p0 = bot.entity.position, f0 = p0.floored();
      const onCell = u && Math.hypot(u.x + .5 - p0.x, u.z + .5 - p0.z) <= 0.95 && bot.blockAt(new Vec3(u.x, f0.y - 1, u.z))?.boundingBox === 'block';
      if (onCell && (f0.x !== u.x || f0.z !== u.z)) { await centreOnColumn(); }
      const underFoot = onCell ? new Vec3(u.x, Math.floor(bot.entity.position.y) - 1, u.z) : bot.entity.position.floored().offset(0, -1, 0);
      if (!scaffold.test(bot.blockAt(underFoot)?.name || '')) break;
      // A roof kept over the head on the way down (note 1455), laid again
      // when the one above is three or more over: the breath that kills on
      // the column comes with no fireball seen in flight, and the way down is
      // where the body stands longest. 25588 (dragon-35, 2026-10-13 10:59Z,
      // full iron, crystal 12 broken) had its roof at 76 and the cloud at its
      // feet at 74, 20 to 14 to 9.7 to 4.7, and was knocked off digging.
      // Every third block (note 1459): the roofs and their posts took 26 blocks of 33 on one climb and descent (dragon-39).
      // Not with the breath at the feet (note 1481): the cloud is 6 a second,
      // and the body is out of it two blocks down; the second block has to be
      // dug inside two seconds, and a roof laid first costs the second.
      // 25588 (dragon-61, 2026-10-13 15:40Z, four crystals broken) took the
      // cloud on crystal 91's column top at 85, began the way down at once,
      // and was a block down two seconds later, 20 to 14 to 8 to 2 to none.
      const inCloud = breathThreat(bot)?.name === 'area_effect_cloud';
      // Not down into the cloud (note 1576): out of it, the dig waits over it.
      const cloudBelow = !inCloud && cloudUnderfoot(2);
      if (cloudBelow) { console.log(`[end combat] the dig down stops at ${bot.entity.position.floored()}: ${cloudUnderfootSays(cloudBelow)}`); break; }
      if (n % 3 === 0 && !inCloud) { const fh = bot.entity.position.floored(); if (![2, 3, 4].some(dy => bot.blockAt(fh.offset(0, dy, 0))?.boundingBox === 'block')) { try { await roofOverhead(); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } } }
      const yBefore = Math.floor(bot.entity.position.y);
      // A gap under the block dug is filled first (note 1434): the climb
      // beside a crystal's obsidian lays its blocks where the feet were, and
      // where the body rested on the obsidian's rim the column has none.
      // 25588 (dragon-18, 2026-10-13 07:40Z) stood at (31, 80, -23) on a
      // cobblestone at 79 with air from 78 to 73, and the dig under its feet
      // was refused ('No solid adjacent footing', the drop below unseen)
      // eleven times while the breath took it from 20 to 8 and the fall the
      // rest. The block goes in against the obsidian's side or the column's
      // own; with none to lay, a drop of three or less is taken as it is.
      const below2 = underFoot.offset(0, -1, 0);
      if (bot.blockAt(below2)?.boundingBox !== 'block') {
        const ref = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].map(([dx, dy, dz]) => ({ b: bot.blockAt(below2.offset(dx, dy, dz)), face: new Vec3(-dx, -dy, -dz) })).find(r => r.b?.boundingBox === 'block');
        const name = blocksCarriedName(bot), item = name && bot.inventory.items().find(i => i.name === name);
        if (ref && item) {
          try {
            await bot.equip(item, 'hand'); check();
            await bot.lookAt(ref.b.position.offset(.5 + ref.face.x * .5, .5 + ref.face.y * .5, .5 + ref.face.z * .5), true);
            await bot.placeBlock(ref.b, ref.face);
          } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
          await sleep(100);
        }
        if (bot.blockAt(below2)?.boundingBox !== 'block') {
          let drop = 0; for (let dy = 1; dy <= 8 && bot.blockAt(underFoot.offset(0, -dy, 0))?.boundingBox !== 'block'; dy++) drop = dy;
          console.log(`[end combat] a gap under the column's block at ${underFoot}: ${drop >= 8 ? 'eight or more' : drop} of air under it, no block laid in it (${ref ? '' : 'nothing solid beside it, '}${item ? '' : 'none of the kinds the climb lays carried'})`);
          if (drop > 3) break;
          // A short drop, as a player takes it: the block dug from where it is stood on.
          try { await bot.dig(bot.blockAt(underFoot), true); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the way down the pillar stopped ${n} down: ${String(err.message || err).slice(0, 120)}`); break; }
          for (let i = 0; i < 30 && Math.floor(bot.entity.position.y) >= yBefore; i++) { check(); await sleep(100); }
          for (let i = 0; i < 40 && !bot.entity.onGround; i++) await sleep(50);
          continue;
        }
      }
      // The dragon's pass is held through and the dig goes on (note 1440):
      // ended at the pass, the way down was a block a question, and 25588
      // (dragon-22, 2026-10-13 08:30Z), 'pillar down stopped 1 of 33 down:
      // dragon_charge_or_contact' at 3 health, was asked again at 8 and
      // climbed, and the breath at the top took the rest.
      bot.setControlState?.('sneak', true);
      try { await actions.dig(bot, task, underFoot, { dropInto: true, openPit: true, requireDrops: false }); }
      catch (err) {
        bot.setControlState?.('sneak', false);
        if (err.name === 'EndEmergency' && ['dragon_charge_or_contact'].includes(endEmergency(bot)) && passes < 20) { passes++; await holdOnColumn(); n--; continue; }
        // A dig something else stopped is dug again at once (note 1445): 25588
        // (dragon-26, 2026-10-13 09:17Z), in the breath on its column at 8
        // health, had its way down end 'Digging aborted' one block down, and
        // the next two ticks of the breath took the rest.
        if (/Digging aborted/.test(String(err.message || '')) && aborts < 3 && bot.entity.onGround !== false) { aborts++; console.log(`[end combat] the dig under the feet was stopped by something else (pathing ${bot.pathfinder?.isMoving?.() ?? '?'}, goal ${bot.pathfinder?.goal ? 'set' : 'none'}, digging ${bot.targetDigBlock?.name || 'nothing'}): dug again`); n--; continue; }
        if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the way down the pillar stopped ${n} down: ${String(err.message || err).slice(0, 120)}`); break;
      }
      // The drop comes late (the server's block update, then the fall): up to
      // three seconds for it. The drill of 2026-10-13 (05:12Z) was called
      // 'not dropped into' after one second and stood a block lower after.
      for (let i = 0; i < 30 && Math.floor(bot.entity.position.y) >= yBefore; i++) { check(); await sleep(100); }
      for (let i = 0; i < 20 && !bot.entity.onGround; i++) await sleep(50);
      // On the island already (the column's last block on the ground): done.
      if (Math.floor(bot.entity.position.y) >= yBefore && bot.blockAt(underFoot.offset(0, -1, 0))?.boundingBox === 'block' && !scaffold.test(bot.blockAt(underFoot.offset(0, -1, 0))?.name || '')) { n++; break; }
      if (Math.floor(bot.entity.position.y) >= yBefore) {
        {
          const q = bot.entity.position, f = q.floored();
          const cells = [[0, -1, 0, 'under'], [1, -1, 0, 'E-1'], [-1, -1, 0, 'W-1'], [0, -1, 1, 'S-1'], [0, -1, -1, 'N-1'], [1, 0, 0, 'E'], [-1, 0, 0, 'W'], [0, 0, 1, 'S'], [0, 0, -1, 'N']].map(([dx, dy, dz, k]) => `${k}:${bot.blockAt(f.offset(dx, dy, dz))?.name || '?'}`).join(' ');
          console.log(`[end combat] the way down the pillar stopped ${n} down: the dug cell was not dropped into; at (${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}) onGround ${bot.entity.onGround} velocity ${JSON.stringify(bot.entity.velocity)} ${cells}`); break;
        }
      }
    }
    bot.setControlState?.('sneak', false);
    // The record kept on the obsidian (note 1473): the way back to the column from the top can fail, and the record dropped there left 25588 (dragon-55, 2026-10-13 14:22Z, crystal 9 broken) 'only observe' on the top, 'column undefined'.
    { const un = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))?.name || ''; if (!scaffold.test(un) && !/^(obsidian|bedrock|iron_bars)$/.test(un)) delete bot._pillarUp; }
    console.log(`[end combat] down the column: ${n} dug, now at ${bot.entity.position.floored()}`);
    // The descent's record for the way-down question (note 1484).
    { const from = digFromY, to = Math.floor(bot.entity.position.y); (state.descents ||= []).push({ at: Date.now(), kind: 'dig', from, to, dug: n, down: from - to >= Math.min(limit, 3), fell: from - to > n + 2, lost: Math.round((digFromHealth - bot.health) * 10) / 10 }); state.descents = state.descents.slice(-20); }
    // The column's blocks lie at its foot: picked up for the next climb. The
    // drill of 2026-10-13 (04:26 to 04:56Z) built four columns and had 16 of
    // its 128 blocks left, none picked up.
    if (n >= 3) {
      const material = blocksCarriedName(bot) || 'cobblestone';
      try { await require('./drop-collection').collectNearbyDrops(bot, task, material, { radius: 6, timeoutMs: 5000, waitForSpawnMs: 500, move: actions.navigate }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
    }
    return n;
  };
  // A block over the head on the column, against a solid beside the cell
  // over it (the crystal's obsidian) or, failing that, nothing: true when
  // the cell over the head is solid after.
  // The pocket against the dragon's wings (note 1575): the death ledger of
  // 2026-10-14 (44 dragon runs) puts the body carried off its column by the
  // dragon first, 10 of 43 deaths (dragon-104, 107, 112, 114, 120, 121 among
  // them): in the game's code the wings' boxes, grown four blocks each way,
  // push every living thing in them 4 / d² sideways and 0.2 up a tick and
  // hurt it 5, and a shield does nothing to the push. On the arena (the pass
  // drill, scripts/pass-drill.js) the body in open air was carried 38 to 52
  // blocks in four passes of four; walls a block high held two of four (the
  // lift took it over); two-high walls under the hold's roof held three of
  // five, the two lost to the dragon's own body passing through the cell.
  // Two blocks on each open side of the body, the side away from the dragon
  // first (the push is away from its body), each side a post from the block
  // under the feet where nothing stands beside. Said in the log.
  const pocketOnColumn = async () => {
    const f = bot.entity.position.floored();
    const under = bot.blockAt(f.offset(0, -1, 0)); if (under?.boundingBox !== 'block') return { laid: 0, closed: 0 };
    const name = blocksCarriedName(bot); let item = name && bot.inventory.items().find(i => i.name === name);
    if (!item) return { laid: 0, closed: 0 };
    const d = dragonThreat(bot) || Object.values(bot.entities).find(e => e.name === 'ender_dragon' && live(bot, e));
    const away = d ? { x: bot.entity.position.x - d.position.x, z: bot.entity.position.z - d.position.z } : null;
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort((a, b) => away ? (b[0] * away.x + b[1] * away.z) - (a[0] * away.x + a[1] * away.z) : 0);
    let laid = 0;
    for (const [dx, dz] of sides) {
      // From the lowest open cell up: the post beside the under block, then the two beside the body.
      for (let dy = -1; dy <= 1; dy++) {
        const c = f.offset(dx, dy, dz);
        if (bot.blockAt(c)?.boundingBox === 'block') continue;
        if (dy === -1 && bot.blockAt(c.offset(0, 1, 0))?.boundingBox === 'block') continue;
        const below = bot.blockAt(c.offset(0, -1, 0)), beside = bot.blockAt(c.offset(-dx, 0, -dz));
        let ref = null, face = null;
        if (below?.boundingBox === 'block') { ref = below; face = new Vec3(0, 1, 0); }
        else if (beside?.boundingBox === 'block') { ref = beside; face = new Vec3(dx, 0, dz); }
        else break;
        item = bot.inventory.items().find(i => i.name === name); if (!item) break;
        try { check(); await bot.equip(item, 'hand'); await bot.lookAt(ref.position.offset(.5 + face.x * .5, .5 + face.y * .5, .5 + face.z * .5), true); await bot.placeBlock(ref, face); await sleep(40); }
        catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; break; }
        if (bot.blockAt(c)?.boundingBox === 'block') laid++; else break;
      }
    }
    const closed = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => bot.blockAt(f.offset(dx, 0, dz))?.boundingBox === 'block' && bot.blockAt(f.offset(dx, 1, dz))?.boundingBox === 'block').length;
    return { laid, closed };
  };
  const roofOverhead = async () => {
    const f = bot.entity.position.floored(), cell = f.offset(0, 2, 0);
    if (bot.blockAt(cell)?.boundingBox === 'block') return true;
    let ref = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].map(([dx, dy, dz]) => ({ b: bot.blockAt(cell.offset(dx, dy, dz)), face: new Vec3(-dx, -dy, -dz) })).find(r => r.b?.boundingBox === 'block');
    const name = blocksCarriedName(bot), item = name && bot.inventory.items().find(i => i.name === name);
    if (!item) return false;
    // Nothing beside the cell over the head (the column at a corner of the
    // obsidian, or alone): a post is laid up the column's own side (note
    // 1454), from the block under the feet to the cell beside the roof's,
    // four blocks, and the roof against it. Half the roofs asked for today
    // were 'not laid' for want of a block beside: 25588 (dragon-34,
    // 2026-10-13 10:53Z, full iron, three crystals in five minutes) took 14
    // of the breath on its climb to crystal 109 and died on the way down.
    if (!ref) {
      const under = bot.blockAt(f.offset(0, -1, 0));
      if (under?.boundingBox !== 'block') return false;
      // Not on the pool's side (note 1556): the post stood where the drop goes, and 25588 (dragon-105, 2026-10-14 01:23Z, two crystals broken) read 'east: end_stone/end_stone beside' over its pool east of the column at (-10, -38), dropped south with no pool, 26 blocks, dead.
      const poolSide = state.pool && Date.now() - state.pool.at < 15 * 60000 ? [state.pool.dx, state.pool.dz] : null;
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !poolSide || dx !== poolSide[0] || dz !== poolSide[1]).find(([dx, dz]) => [-1, 0, 1, 2].every(dy => bot.blockAt(f.offset(dx, dy, dz))?.boundingBox !== 'block'));
      if (!side) return false;
      try {
        await bot.equip(item, 'hand'); check();
        // The first against the under block's side, the rest each on the one below.
        await bot.lookAt(under.position.offset(.5 + side[0] * .5, .5, .5 + side[1] * .5), true); await bot.placeBlock(under, new Vec3(side[0], 0, side[1])); await sleep(60);
        for (let dy = 0; dy <= 2; dy++) {
          const below = bot.blockAt(f.offset(side[0], dy - 1, side[1])); if (below?.boundingBox !== 'block') break;
          check(); await bot.lookAt(below.position.offset(.5, 1, .5), true); await bot.placeBlock(below, new Vec3(0, 1, 0)); await sleep(60);
        }
      } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
      const post = bot.blockAt(cell.offset(side[0], 0, side[1]));
      if (post?.boundingBox !== 'block') { console.log(`[end combat] no post for a roof over the head at ${cell}: ${post?.name || 'nothing'} where its top should be`); return false; }
      ref = { b: post, face: new Vec3(-side[0], 0, -side[1]) };
    }
    try {
      await bot.equip(item, 'hand'); check();
      await bot.lookAt(ref.b.position.offset(.5 + ref.face.x * .5, .5 + ref.face.y * .5, .5 + ref.face.z * .5), true);
      await bot.placeBlock(ref.b, ref.face);
    } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
    const roofed = bot.blockAt(cell)?.boundingBox === 'block';
    console.log(`[end combat] a roof against the fireball over the head at ${cell}: ${roofed ? 'laid' : 'not laid'}`);
    return roofed;
  };
  // The way down the column by the water bucket (note 1484): off the column's
  // edge onto the island by its foot, the water under the body in the last
  // blocks of the fall (fall-recovery.js), the bucket filled again from the
  // pool. The dig down is a block a second and a half, 15 to 20 of them,
  // and every blow of the breath on a column one wide knocks the body 0.4
  // away from the dragon and lifts it: 25588 fell off its column in the
  // breath five times on 2026-10-13 (dragon-59, 61, 62, 63, 64), three to
  // its death, two blows enough each time. The side stepped off: the one
  // with ground soonest under it and nothing solid beside the feet.
  // The pool poured at the column's foot before the climb (note 1509), where
  // the drop lands: the pour in the air is a tick's work at a block and a
  // half a tick, and a tick late it is nothing. 25588 (dragon-77, 2026-10-13
  // 19:41Z) landed 'in the water' at 2 health, the water a tick behind the
  // body; dragon-71, 73, 74, 75 and 76 landed dry or died, one drop in four.
  // A source on level ground spreads seven blocks round, and any water under
  // the feet, flowing or still, ends the fall. Poured on a cell beside the
  // column's base away from the obsidian, with the ground about it level
  // (nothing two lower within four) and no void within eight; taken back
  // after the landing (note 1495). The side it lies on is the drop's.
  // The cell the drop's pool would be poured on beside a column base, or null (note 1539: read for the climb's option as well as the pour).
  const poolCellFor = (base, lift = 20) => {
    const column = base;
    const ground = (x, z) => { for (let y = base.y + 1; y >= base.y - 3; y--) if (bot.blockAt(new Vec3(x, y, z))?.boundingBox === 'block') return y; return null; };
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = column.x + dx, z = column.z + dz, g = ground(x, z); if (g === null || Math.abs(g + 1 - base.y) > 1) continue;
      // Out along the side by the fall's length (note 1530): the body steps off at a walk and keeps its way in the air, about a block out for every eight of fall, and 25588 (dragon-88, 2026-10-13 22:24Z, five crystals broken) fell 33 from (-29, 94, -25) and landed five blocks past its pool poured two out, dead. The furthest level cell out to that distance, one at the least.
      const want = Math.max(1, Math.min(5, Math.round(lift / 8)));
      let cell = new Vec3(x, g + 1, z);
      // A block standing one up in the row is dug down first (note 1536): the
      // water does not pass it, and the body comes down beyond it. 25588
      // (dragon-92, 2026-10-13 23:23Z, six crystals broken) had its pool at
      // (-27, 61, -25), two out east of its column at (-29, -25), the row's
      // third cell (-26, 61, -25) end stone a block up; the water ran round it,
      // not over it, and the body fell 33 onto that one dry block, 20 to none.
      const raised = [];
      for (let k = 1; k <= want + 1; k++) {
        const cx = x + dx * k, cz = z + dz * k, gk = ground(cx, cz);
        if (gk === g + 1 && bot.blockAt(new Vec3(cx, gk, cz))?.name === 'end_stone' && actions.dig && raised.length < 3) { raised.push(new Vec3(cx, gk, cz)); if (k <= want) cell = new Vec3(cx, g + 1, cz); continue; }
        if (gk === null || gk !== g || bot.blockAt(new Vec3(cx, g + 1, cz))?.name !== 'air') break;
        if (k <= want) cell = new Vec3(cx, g + 1, cz);
      }
      if (bot.blockAt(cell)?.name !== 'air' && !raised.some(r => r.equals(cell))) continue;
      // The void three away, not eight, and level ground two about, not four,
      // where the trench holds the water (note 1555): nothing runs off. The
      // eight was the open pour's, whose spread ran seven cells to the rim and
      // over; and at the island's eastern rim pillars (9, 11, 12, 14 of this
      // world) it left every climb with no pool, the clutch alone for the way
      // down, and 25588 died on that drop six times on 2026-10-13/14
      // (dragon-84, 90, 93, 104 among them).
      const clear = actions.dig ? 3 : 8, about = actions.dig ? 2 : 4;
      if (voidEdge(bot, cell.offset(.5, 0, .5), clear) !== null) continue;
      let level = true, obsidian = 0;
      for (let ox = -about; ox <= about && level; ox++) for (let oz = -about; oz <= about && level; oz++) { const gg = ground(x + ox, z + oz); if (gg === null || gg < g - 1) level = false; }
      if (!level) continue;
      for (let k = 1; k <= 3; k++) for (let dy = -1; dy <= 3; dy++) if (bot.blockAt(new Vec3(x + dx * k, g + dy, z + dz * k))?.name === 'obsidian') obsidian++;
      const score = obsidian * 10 + raised.length * 2 + bot.entity.position.distanceTo(cell.offset(.5, 0, .5));
      if (!best || score < best.score) best = { cell, dx, dz, score, obsidian, raised };
    }
    return best;
  };
  const poolForTheDrop = async (column, lift = 20) => {
    let water = bot.inventory.items().find(i => i.name === 'water_bucket');
    if (!water) return null;
    const best = poolCellFor(new Vec3(column.x, Math.floor(bot.entity.position.y), column.z), lift);
    if (!best) { console.log(`[end combat] no pool for the drop at the foot of (${column.x}, ${column.z}): no level cell beside the column's base clear of the void`); return null; }
    for (const r of best.raised || []) {
      try {
        if (bot.entity.position.offset(0, 1.62, 0).distanceTo(r.offset(.5, .5, .5)) > 4.3) await actions.navigate(bot, task, new goals.GoalNear(r.x, r.y, r.z, 2), { timeoutMs: 6000, stallMs: 3000 });
        await actions.dig(bot, task, r, { requireDrops: false });
        console.log(`[end combat] the pool's row levelled: the block a step up at ${r} dug`);
      } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the pool's row not levelled at ${r}: ${String(err.message || err).slice(0, 80)}`); }
    }
    // The row dug one deep into a trench before the pour, the water poured in
    // its middle (note 1540): on open ground the water runs only toward the
    // nearest drop within four blocks, and 25588 (dragon-94, 2026-10-13
    // 23:44Z, two crystals broken) had its pool at (-6, 61, -42), four out
    // east of its column at (-10, -42), flow east alone; the two cells between
    // the column and the pour stayed dry and the body fell 27 onto (-8, 61,
    // -42), 20 to none. In a trench the water is the lowest thing about and
    // fills it end to end.
    if (actions.dig) {
      const g = best.cell.y - 1, len = Math.min(5, Math.max(2, Math.round(lift / 8) + 1)), trench = [];
      for (let k = 1; k <= len; k++) {
        const floor = new Vec3(column.x + best.dx * k, g, column.z + best.dz * k);
        if (bot.blockAt(floor)?.name !== 'end_stone' || bot.blockAt(floor.offset(0, -1, 0))?.boundingBox !== 'block' || bot.blockAt(floor.offset(0, 1, 0))?.boundingBox === 'block') break;
        trench.push(floor);
      }
      let dug = 0;
      for (const t of trench) {
        try {
          if (bot.entity.position.offset(0, 1.62, 0).distanceTo(t.offset(.5, .5, .5)) > 4.3) await actions.navigate(bot, task, new goals.GoalNear(t.x, t.y + 1, t.z, 2), { timeoutMs: 6000, stallMs: 3000 });
          await actions.dig(bot, task, t, { requireDrops: false }); dug++;
        } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the pool's trench stopped at ${t}: ${String(err.message || err).slice(0, 80)}`); break; }
      }
      // Three wide (note 1553), not one: a body 0.6 wide comes down anywhere in
      // its cell, and over a trench one wide its box straddles the rim and it
      // stands on the rim's stone with the water below its feet. 25588
      // (dragon-101, 2026-10-14 00:59Z, and dragon-102, 01:06Z) each came down
      // on the third cell of a trench whose four cells were all water, at
      // x -10.82 over the cell -11 to -10, and died at the rim's height, the
      // clutch holding its click for the water it saw below.
      let sides = 0;
      for (const t of trench.slice(0, dug)) for (const [sx, sz] of [[best.dz, best.dx], [-best.dz, -best.dx]]) {
        const c = t.offset(sx, 0, sz);
        if (bot.blockAt(c)?.name !== 'end_stone' || bot.blockAt(c.offset(0, -1, 0))?.boundingBox !== 'block' || bot.blockAt(c.offset(0, 1, 0))?.boundingBox === 'block') continue;
        try {
          if (bot.entity.position.offset(0, 1.62, 0).distanceTo(c.offset(.5, .5, .5)) > 4.3) await actions.navigate(bot, task, new goals.GoalNear(c.x, c.y + 1, c.z, 2), { timeoutMs: 6000, stallMs: 3000 });
          await actions.dig(bot, task, c, { requireDrops: false }); sides++;
        } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the pool's trench side not dug at ${c}: ${String(err.message || err).slice(0, 80)}`); }
      }
      if (sides) console.log(`[end combat] the pool's trench widened: ${sides} side cells dug`);
      // Every cell of the row read back (note 1594): a dig that came to nothing
      // left (30, 58, -28) solid in a row of four, 'the pool's trench dug: 4
      // cells', and 25588 (dragon-138, 2026-10-14 07:27Z, four crystals
      // broken) came down from 82 on exactly that cell, 20 to none. A cell
      // still solid is dug once more; one still solid after that ends the row there.
      for (let i = 0; i < dug; i++) {
        const t = trench[i];
        if (bot.blockAt(t)?.boundingBox !== 'block') continue;
        try { check(); await actions.dig(bot, task, t, { requireDrops: false }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
        if (bot.blockAt(t)?.boundingBox === 'block') { console.log(`[end combat] the pool's trench cell ${t} stayed solid after two digs: the row ends before it`); dug = i; break; }
        console.log(`[end combat] the pool's trench cell ${t} was still solid and is dug now`);
      }
      // The fall's way over the row cleared (note 1599): a block standing one to
      // three over the trench's floor along the row is 'in the fall's way'
      // (note 1543) and the pool's side is set aside for it. 25588 (dragon-141,
      // 2026-10-14 08:05Z, three crystals broken) poured its pool north of
      // crystal 117's column, had 'end_stone in the fall's way at (-36, 61,
      // 19), 1 over the floor', took the west side with no pool and no bucket
      // left, and dug 24 blocks down the column.
      let cleared = 0;
      for (const t of trench.slice(0, dug)) for (let dy = 1; dy <= 3; dy++) {
        const c = t.offset(0, dy, 0), b = bot.blockAt(c);
        if (b?.boundingBox !== 'block' || /obsidian|bedrock/.test(b.name)) continue;
        try { check(); if (bot.entity.position.offset(0, 1.62, 0).distanceTo(c.offset(.5, .5, .5)) > 4.3) await actions.navigate(bot, task, new goals.GoalNear(c.x, c.y, c.z, 2), { timeoutMs: 6000, stallMs: 3000 }); await actions.dig(bot, task, c, { requireDrops: false }); cleared++; }
        catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
      }
      if (cleared) console.log(`[end combat] the fall's way over the pool's row cleared: ${cleared} block${cleared === 1 ? '' : 's'} dug`);
      if (dug >= 2) { best.cell = trench[Math.floor((dug - 1) / 2)].clone(); best.reach = dug; console.log(`[end combat] the pool's trench dug: ${dug} cells from ${trench[0]} out from the column at (${column.x}, ${column.z}); the water goes in at ${best.cell}${dug < len ? ` (${len} wanted: the row ends there)` : ''}`); }
    }
    const eye = bot.entity.position.offset(0, 1.62, 0), target = best.cell.offset(.5, -.01, .5);
    if (eye.distanceTo(target) > 4.3) {
      try { await actions.navigate(bot, task, new goals.GoalNear(best.cell.x, best.cell.y, best.cell.z, 2), { timeoutMs: 8000, stallMs: 3000 }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
    }
    // The look given three ticks to reach the server before the click (note 1593): clicked on the heels of lookAt the server still has the old look, and the water goes in at the feet. 'The water went in at ... not at' (note 1574) said so nine times in runs 120 to 138 of 2026-10-14; at 07:21Z (dragon-138) it went in at the column's own foot cell and the climb buried it, 'no pool' at the top. A source in the bot's own cell is taken back and poured once more.
    const pourOnce = async () => {
      await bot.equip(water, 'hand'); check();
      await bot.lookAt(target, true); await sleep(150);
      bot.activateItem();
      for (let n = 0; n < 20; n++) { check(); if (bot.blockAt(best.cell)?.name === 'water') break; await sleep(50); }
    };
    try {
      await pourOnce();
      const feetCell = bot.entity.position.floored();
      if (bot.blockAt(best.cell)?.name !== 'water' && bot.blockAt(feetCell)?.name === 'water' && !feetCell.equals(best.cell)) {
        console.log(`[end combat] the water went in at the feet ${feetCell}, not at ${best.cell}: taken back and poured again`);
        try { await require('./water').fillWaterBucket(bot, task, feetCell, { timeoutMs: 1500 }); } catch (_) { /* left */ }
        water = bot.inventory.items().find(i => i.name === 'water_bucket');
        if (water) await pourOnce();
      }
    } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
    // The pool is where the source went in, not where the flow reached (note
    // 1574): the click put the water at the feet, it ran down into the trench,
    // 'poured' was read off the flow at the trench's cell, and the step's
    // start took the source back from the feet as water left over. 25588
    // (dragon-121, 2026-10-14 04:17Z, crystal 109) poured at (34, 57, -22),
    // took back (33, 59, -22) a moment later, and climbed with 'no pool'.
    const { sourceWater: isSource } = require('./water');
    let poured = bot.blockAt(best.cell)?.name === 'water' && isSource(bot.blockAt(best.cell));
    if (!poured) {
      const src = bot.findBlocks({ matching: bot.registry.blocksByName.water.id, maxDistance: 6, count: 8, useExtraInfo: isSource }).map(p => p.floored()).filter(p => Math.abs(p.x - best.cell.x) <= 2 && Math.abs(p.z - best.cell.z) <= 2 && Math.abs(p.y - best.cell.y) <= 3 && !(state.poolsLeft || []).some(w => w.x === p.x && w.y === p.y && w.z === p.z)).sort((p, q) => p.distanceTo(best.cell) - q.distanceTo(best.cell))[0];
      if (src) { console.log(`[end combat] the water went in at ${src}, not at ${best.cell}: the pool is there`); best.cell = src; poured = true; }
    }
    console.log(`[end combat] the pool for the drop ${poured ? 'poured' : 'not poured'} at ${best.cell} beside the column at (${column.x}, ${column.z})${best.obsidian ? `, ${best.obsidian} obsidian that way` : ''}; ${countOf(bot, 'water_bucket')} full bucket${countOf(bot, 'water_bucket') === 1 ? '' : 's'} left`);
    if (poured) { state.pool = { x: best.cell.x, y: best.cell.y, z: best.cell.z, dx: best.dx, dz: best.dz, at: Date.now(), ...(best.reach ? { reach: best.reach } : {}) }; (state.poolsLeft ||= []).push({ x: best.cell.x, y: best.cell.y, z: best.cell.z, at: Date.now() }); save(); return state.pool; }
    return null;
  };
  // Whether a pool can be poured at a pillar's foot, read from the foot cell on the bot's side of it (note 1539).
  const poolAtTheFoot = (c, radius, lift) => {
    try {
      const here = bot.entity.position, dx = here.x - (c.x + .5), dz = here.z - (c.z + .5), n = Math.hypot(dx, dz) || 1;
      const fx = Math.floor(c.x + .5 + dx / n * (radius + 1.5)), fz = Math.floor(c.z + .5 + dz / n * (radius + 1.5));
      let gy = null; for (let y = 72; y >= 36 && gy === null; y--) if (bot.blockAt(new Vec3(fx, y, fz))?.boundingBox === 'block') gy = y;
      if (gy === null) return false;
      return !!poolCellFor(new Vec3(fx, gy + 1, fz), lift);
    } catch (_) { return false; }
  };
  // The water left standing from the fight's pours and clutches, for the facts.
  const waterLeftSays = () => {
    const here = bot.entity.position, left = (state.poolsLeft || []).filter(w => bot.blockAt(new Vec3(w.x, w.y, w.z))?.name === 'water').map(w => ({ w, d: Math.round(here.distanceTo(new Vec3(w.x + .5, w.y, w.z + .5))) })).sort((a, b) => a.d - b.d);
    return left.length ? `the water left at (${left[0].w.x}, ${left[0].w.y}, ${left[0].w.z}), ${left[0].d} blocks off, goes back into the bucket when the bot stands within reach of it (take_back_water); ` : 'no water of this fight\'s is left standing anywhere; ';
  };
  const waterDropSide = () => {
    const u = bot._pillarUp; if (!u) return null;
    // From the column's own cell (note 1489): after the blow the body stands
    // on the obsidian's rim beside its column, and from that cell the only
    // open side is the column's top, no fall. 25588 (dragon-66, 2026-10-13
    // 16:38Z) at (-11, 79, 39) beside its column at (-10, 39): 'no side with
    // ground under it', and it dug instead.
    const f = new Vec3(u.x, Math.floor(bot.entity.position.y), u.z);
    let best = null; const verdicts = []; let clearFirst = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const name = dx === 1 ? 'east' : dx === -1 ? 'west' : dz === 1 ? 'south' : 'north';
      if (bot.blockAt(f.offset(dx, 0, dz))?.boundingBox === 'block' || bot.blockAt(f.offset(dx, 1, dz))?.boundingBox === 'block') {
        // The pool's side walled by the bot's own blocks (a roof's post, note 1556): those are dug before the drop, not another side taken.
        // And the post one under them (note 1577): the pocket's wall stands on a post beside the under block, and left standing it is 'a floor 0 down' where the drop goes. 25588 (dragon-127, 2026-10-14 05:13Z) dug its two wall blocks and had no fall.
        const own = [-1, 0, 1].map(dy => f.offset(dx, dy, dz)).filter(c => { const b = bot.blockAt(c); return b?.boundingBox === 'block' && SCAFFOLD_UNDER.test(b.name) && b.name !== 'obsidian' && !(c.y <= f.y - 1 && bot.blockAt(c.offset(0, -1, 0))?.boundingBox === 'block'); });
        const poolHere = state.pool && Date.now() - state.pool.at < 15 * 60000 && state.pool.dx === dx && state.pool.dz === dz;
        if (poolHere && own.length && [0, 1].every(dy => { const b = bot.blockAt(f.offset(dx, dy, dz)); return b?.boundingBox !== 'block' || own.some(c => c.equals(f.offset(dx, dy, dz))); })) clearFirst = { cells: own, name };
        verdicts.push(`${name}: ${bot.blockAt(f.offset(dx, 0, dz))?.name}/${bot.blockAt(f.offset(dx, 1, dz))?.name} beside${poolHere ? ' (the pool\'s side)' : ''}`); continue;
      }
      let fall = null;
      for (let dy = 1; dy <= 48; dy++) { const bl = bot.blockAt(f.offset(dx, -dy, dz)); if (bl?.boundingBox === 'block') { fall = dy - 1; break; } if (bl?.name === 'lava') break; }
      if (fall === null || fall < 3) { verdicts.push(`${name}: ${fall === null ? 'no floor within 48' : `a floor ${fall} down`}`); continue; }
      // Away from the obsidian (note 1501): the water goes where the server's
      // line of sight from the body reaches the floor, and a fall down the
      // pillar's side has the obsidian in that line. Both dry landings of
      // dragon-71 and the fatal one of dragon-73 (25588, 2026-10-13 18:05Z and
      // 18:51Z) were off the column at (33, -22) toward (30, 60, -22), the
      // pillar's foot beside the way down; the drops away from a pillar landed
      // in water every time.
      let obsidian = 0; for (let k = 1; k <= 3; k++) for (let dy = -3; dy <= 2; dy++) if (bot.blockAt(f.offset(dx * k, dy, dz * k))?.name === 'obsidian') obsidian++;
      // The pool's own side (note 1517), the water still standing: a pool within three of either side's landing made both sides 'the pool's', the shorter fall was taken on the far side, and 25588 (dragon-81, 2026-10-13 20:39Z) landed four blocks east of its pool at (-14, 61, -44) from 27 up and died. The quarry's pits round a foot swallow a pool's spread, so the water must lie on the side stepped off.
      const recorded = state.pool && Date.now() - state.pool.at < 15 * 60000 && bot.blockAt(new Vec3(state.pool.x, state.pool.y, state.pool.z))?.name === 'water' ? state.pool : null;
      // The pool's row is the body's row (note 1545): along the side one to six out, and a cell at most to either hand. The trench is one wide, and 25588 (dragon-96, 2026-10-14 00:20Z, two crystals broken) dropped east from its column at (-9, -40) 'into the pool' recorded at (-8, 60, -42), the trench of an earlier column two cells south, fell 26 onto dry stone at (-6, 61, -40), 20 to none.
      const along = recorded ? (recorded.x - u.x) * dx + (recorded.z - u.z) * dz : 0, aside = recorded ? Math.abs((recorded.x - u.x) * dz) + Math.abs((recorded.z - u.z) * dx) : 0;
      // And at the landing's height (note 1597): the eastern pillars stand where the shelf at 38 meets the island's top at 59, a pool poured at the shelf is twenty blocks under a drop that lands on the top, and 25588 (dragon-140, 2026-10-14 07:58Z) stepped west off crystal 15's column at 82 'into the pool' recorded at (31, 37, -22), came down on the rim at 59, dead.
      const landingY = f.y - fall, poolBelow = recorded ? landingY - recorded.y : 0;
      let pool = !!recorded && recorded.dx === dx && recorded.dz === dz && along >= 1 && along <= 6 && aside <= 1 && Math.abs(poolBelow) <= 2;
      if (recorded && recorded.dx === dx && recorded.dz === dz && along >= 1 && along <= 6 && aside <= 1 && Math.abs(poolBelow) > 2) verdicts.push(`${name}: the pool recorded at (${recorded.x}, ${recorded.y}, ${recorded.z}) lies ${Math.abs(poolBelow)} blocks ${poolBelow > 0 ? 'below' : 'above'} this side's landing at ${landingY}, no pool under it`);
      // The trench's reach (note 1552): the body comes down about a cell out for every eight of fall, and a trench shorter than that is no pool under it. 25588 (dragon-101, 2026-10-14 00:59Z, two crystals broken) had a trench of two cells west of its column at (-13, -36), fell 27 toward it and came down on the third cell, 18.3 to none.
      let shortTrench = false;
      if (pool && recorded.reach && Math.round(fall / 8) > recorded.reach) { pool = false; shortTrench = true; }
      // With a pool recorded, its side alone is the pool's (note 1531): the pool's spread reaches the cells of the next side too, and 25588 (dragon-89, 2026-10-13 22:32Z, two crystals broken) had 'west: the pool; south: the pool' with the pool poured south, took west, the first of equals, and fell 26 onto stone, dead.
      if (!pool && !recorded) for (let k = 1; k <= 3 && !pool; k++) for (let dy = -1; dy <= 1 && !pool; dy++) if (bot.blockAt(f.offset(dx * k, -fall + dy, dz * k))?.name === 'water') pool = true;
      // The cells along the body's way out (note 1543), a block out for every
      // eight of fall: a block standing in them higher than the floor beside
      // the column is the landing, not the pool. 25588 (dragon-95, 2026-10-14
      // 00:05Z, three crystals broken) stepped off crystal 96's column at
      // (-32, 85, 21) east toward its pool and came down on the stump of its
      // own earlier column at (-30, 69, 21), two cells out, 20 to 7.
      let inTheWay = null, overEdge = null;
      for (let k = 2; k <= Math.max(2, Math.round(fall / 8) + 1) && !inTheWay; k++) {
        for (let dy = 0; dy < fall - 1; dy++) { const bl = bot.blockAt(f.offset(dx * k, -dy, dz * k)); if (bl?.boundingBox === 'block') { inTheWay = { cell: f.offset(dx * k, -dy, dz * k), over: fall - 1 - dy }; break; } }
        // The floor falling away beyond the landing (note 1569): a cell along the
        // way with no floor within six under the landing's level is the island's
        // edge, and the body carried that far goes over it. 25588 (dragon-117,
        // 2026-10-14 03:45Z, crystal 9 broken) dropped east off its column at
        // (36, 78, -25), '21 down' onto (37, -25), the rim's last cell, and fell
        // 43 to the shelf at 35, dead.
        if (!inTheWay && !overEdge) { let floor = null; for (let dy = fall - 1; dy <= fall + 6; dy++) { if (bot.blockAt(f.offset(dx * k, -dy, dz * k))?.boundingBox === 'block') { floor = dy; break; } } if (floor === null) overEdge = { cell: f.offset(dx * k, -fall, dz * k), k }; }
      }
      const score = fall + obsidian * 20 - (pool ? 100 : 0) + (inTheWay ? 200 : 0) + (overEdge ? 300 : 0);
      verdicts.push(`${name}: ${fall} down${pool ? ', the pool' : ''}${shortTrench ? `, the pool's trench of ${recorded.reach} short of the landing about ${Math.round(fall / 8)} out` : ''}${obsidian ? `, ${obsidian} obsidian` : ''}${overEdge ? `, the floor falls away ${overEdge.k} out (the edge)` : ''}${inTheWay ? `, ${bot.blockAt(inTheWay.cell)?.name} in the fall's way at ${inTheWay.cell}, ${inTheWay.over} over the floor` : ''}`);
      if (!best || score < best.score) best = { dx, dz, fall, obsidian, pool: pool && !inTheWay && !overEdge, inTheWay, overEdge, score, edge: f.offset(dx, 0, dz), name };
    }
    // Said (note 1522): 25588 (dragon-83, 2026-10-13 21:17Z, six crystals broken) poured its pool south of the column at (-30, -22), dropped from 79 and landed three blocks east of it, dead, and no line said which side was stepped off or why.
    if (clearFirst) { console.log(`[end combat] the drop's sides from ${f}: ${verdicts.join('; ')}; the ${clearFirst.name} side, the pool's, walled by the bot's own blocks: dug first`); return { clearFirst: clearFirst.cells }; }
    console.log(`[end combat] the drop's sides from ${f}: ${verdicts.join('; ')}${best ? `; ${best.name} taken` : '; none'}${state.pool ? ` (the pool recorded at (${state.pool.x}, ${state.pool.y}, ${state.pool.z}), ${state.pool.dx === 1 ? 'east' : state.pool.dx === -1 ? 'west' : state.pool.dz === 1 ? 'south' : 'north'} of the column)` : ''}`);
    return best;
  };
  // Up out of the water onto the nearest rim (notes 1559, 1561, 1570): sideways
  // to the side whose rim stands a block up with air over it, forward and the
  // jump. Called after the drop's landing, and at the step's start whenever the
  // body is in water or its breath is going: 25588 (dragon-118, 2026-10-14
  // 03:49Z) quarried on with its head under water at (48, 55, 12), oxygen 17
  // to 0, and the survival's 'swim_to_land' spun 21 times a second without a
  // step; drowned at full health in twelve seconds.
  const outOfTheWater = async () => {
    const feet = bot.entity.position.floored();
    const ways = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => { for (let d = 1; d <= 2; d++) { const c = feet.offset(dx * d, 0, dz * d); if (bot.blockAt(c)?.boundingBox === 'block' && bot.blockAt(c.offset(0, 1, 0))?.boundingBox !== 'block' && bot.blockAt(c.offset(0, 2, 0))?.boundingBox !== 'block') return { dx, dz, d }; if (bot.blockAt(c)?.name !== 'water') break; } return null; }).filter(Boolean).sort((a, b) => a.d - b.d);
    const way = ways[0];
    // No rim found beside: toward the island's middle (note 1586), never a fixed east. 25588 (dragon-131, 2026-10-14 06:04Z) in water flowing down the eastern slope at (41, 55, -22) moved east, 'no rim found beside', and went down the cliff with the flow.
    const middle = state.arenaCenter ? vector(state.arenaCenter) : new Vec3(0, bot.entity.position.y, 0);
    const toMiddle = new Vec3(middle.x - bot.entity.position.x, 0, middle.z - bot.entity.position.z); const len = Math.hypot(toMiddle.x, toMiddle.z) || 1;
    const toward = way ? feet.offset(way.dx * (way.d + 1) + .5, 1.5, way.dz * (way.d + 1) + .5) : bot.entity.position.offset(toMiddle.x / len * 2, 1, toMiddle.z / len * 2);
    try {
      await require('./motion').move(bot, task, { label: 'out_of_the_trench', keys: ['forward', 'jump'], sneak: false, why: 'up out of the water onto the rim before anything else (notes 1559, 1570)', look: toward, maxMs: 2500, tick: 25, until: () => !inWater() && bot.entity.onGround });
    } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
    console.log(`[end combat] out of the trench: ${inWater() ? 'still in the water' : 'on the rim'} at ${bot.entity.position.floored()}${way ? ` (${way.dx === 1 ? 'east' : way.dx === -1 ? 'west' : way.dz === 1 ? 'south' : 'north'}, the rim ${way.d} off)` : ' (no rim found beside)'}`);
    return !inWater();
  };
  const waterDrop = async ({ inCloud = false } = {}) => {
    let side = waterDropSide();
    if (side?.clearFirst && actions.dig) {
      for (const c of side.clearFirst) { try { await actions.dig(bot, task, c, { requireDrops: false }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the pool's side not cleared at ${c}: ${String(err.message || err).slice(0, 80)}`); } }
      side = waterDropSide();
    }
    if (side?.clearFirst) side = null;
    const water = bot.inventory.items().find(i => i.name === 'water_bucket');
    // Into the pool with no bucket in hand (note 1514): the pool at the foot is the landing, the bucket in the air only the second chance. 25588 (dragon-78, 2026-10-13 20:16Z) poured its last bucket into the pool at crystal 94's foot, struck the crystal, and was refused the drop at 85, 'no water bucket carried', the pool under it.
    if (!side || (!water && !side.pool)) { console.log(`[end combat] no water drop from ${bot.entity.position.floored()}: ${!side ? 'no side with ground under it' : 'no water bucket carried and no pool under the way down'}`); return false; }
    const startY = bot.entity.position.y, health = bot.health;
    // Not a fall that kills if the water is late (note 1504): a fall takes its blocks less three, and the pour has missed one drop in six. 25588 (dragon-74, 2026-10-13 19:15Z, five crystals broken) stepped off crystal 87's column at 97, 40 blocks, and died on the ground at 58 with no water poured.
    // No height is refused (note 1521, the user's call of 2026-10-13 21:10Z): the pool at the foot takes any fall, the bucket in the air is the second chance, and the dig first stood the body in the breath (dragon-79 and 80 died digging). Said with the fall's cost if both miss.
    // Into the pool from any height (the user's call); with no pool and no breath at the feet, a fall that kills dry is dug down first to where it does not (note 1524): the bucket in the air is a coin flip at a block and a half a tick, and 25588 (dragon-84, 2026-10-13 21:24Z, four crystals broken) took a drop of 43 into its pool unhurt, then one of 23 off crystal 11's column, where no pool can be poured at the rim, and died at 18.4 health.
    if (side.fall - 3 >= health - 1 && !side.pool && !inCloud) { const dig = side.fall - 3 - Math.floor(health - 1) + 1; console.log(`[end combat] no water drop from ${bot.entity.position.floored()}: a fall of ${side.fall} blocks takes about ${side.fall - 3} health and the body has ${health.toFixed(1)}, no pool under the way down; ${dig} dug first`); waterDrop.tooHighBy = dig; return false; }
    if (side.fall - 3 >= health - 1) console.log(`[end combat] the water drop of ${side.fall} blocks at ${health.toFixed(1)} health${side.pool ? ', into the pool at the foot' : ', the breath at the feet'}: a dry landing would take about ${side.fall - 3}`);
    waterDrop.tooHighBy = 0;
    goal.step = { action: 'water_drop', from: { ...bot.entity.position }, fall: side.fall, health }; save();
    // Onto the column's cell first, at a crouch, where the body stands beside it on the rim.
    if (!await centreOnColumn(0.3)) console.log(`[end combat] the water drop begins ${Math.round(Math.hypot(bot._pillarUp.x + .5 - bot.entity.position.x, bot._pillarUp.z + .5 - bot.entity.position.z) * 100) / 100} off the column's middle`);
    console.log(`[end combat] the water drop from ${bot.entity.position.floored()}, ${side.fall} blocks onto the island at (${side.edge.x}, ${side.edge.z})${side.pool ? ', into the pool' : ', no pool under it'}${side.obsidian ? `, ${side.obsidian} obsidian beside the way` : ''}, health ${health.toFixed(1)}`);
    if (water) { try { await bot.equip(water, 'hand'); } catch (_) { /* equipped in the fall */ } }
    // Upright for the step (note 1492): the crouch kept on the column (note
    // 1480) backs a crouched body off every edge, and the step off went 0.6
    // of a block and stopped at the edge, 'still up', four times in
    // dragon-67 and dragon-68 (25588, 2026-10-13 16:45 to 17:05Z).
    // The health read again at the step-off (note 1538): the drop was judged at
    // 20.0 and taken at 17.3, the dragon's blow landing between, and 25588
    // (dragon-93, 2026-10-13 23:36Z) fell 21 with no pool, 18 of fall damage
    // against 17.3, dead on the rim.
    if (side.fall - 3 >= bot.health - 1 && !side.pool && !inCloud) { const dig = side.fall - 3 - Math.floor(bot.health - 1) + 1; console.log(`[end combat] the water drop held at the step-off: the health is ${bot.health.toFixed(1)} now, a fall of ${side.fall} takes about ${side.fall - 3}, no pool under the way down; ${dig} dug first`); waterDrop.tooHighBy = dig; return false; }
    // The dragon's body about to pass (note 1589): a body in the air is in its wings' push, and 25588 (dragon-133, 2026-10-14 06:22Z) stepped off crystal 9's column at (35, 82, -23) as the dragon came, took its blow at 81 and was carried five east and four north of its pool, dead at (40, 56, -19). Out of the cloud, the step waits up to two and a half seconds for the body to pass; in the cloud it goes.
    if (!inCloud && breathThreat(bot)?.name !== 'area_effect_cloud' && dragonThreat(bot)) {
      const t0 = Date.now(); let waited = 0;
      while (Date.now() - t0 < 2500 && dragonThreat(bot)) { check(); await sleep(100); waited = Date.now() - t0; }
      console.log(`[end combat] the step off waited ${waited} ms for the dragon's body to pass${dragonThreat(bot) ? ' (still coming: the step goes)' : ''}`);
    }
    bot._dropping = true;
    // The step's emergency check set aside for the step off (note 1550): the
    // drop is the answer to the fireball and the breath, and the move's own
    // check threw 'EndEmergency' at its first tick with a fireball in flight,
    // swallowed here, 'the water drop ended still up'. 25588 (dragon-99,
    // 2026-10-14 00:48Z, two crystals broken) stood on its column at 80 with
    // the pool beside it, pressed nothing for two seconds, and took the
    // fireball's cloud there, 20 to none in three seconds.
    const dropInterrupt = task.interruptCheck; task.interruptCheck = undefined;
    try {
      bot.setControlState?.('sneak', false);
      await require('./motion').move(bot, task, { label: 'water_drop', keys: ['forward'], sneak: false, why: 'off the column onto the island by its foot, the water bucket in hand for the landing (note 1484)',
        // The fall is the move's purpose (note 1490): refused as a 'deadly fall ahead', 25588 (dragon-67, 2026-10-13 16:45Z) stood on its column top at 103 'still up' twice and dug instead.
        // Aimed far along the drop's axis, not at the next cell's middle (note 1585): from a body 0.3 off the column's middle the next cell's middle is 17 degrees off the axis, and over a fall of 41 blocks (the walk-off lands 2.7 to 3.0 out, the arena's drop drill, 2026-10-14) that is two blocks sideways. 25588 (dragon-130, 06:00Z, six crystals broken) stepped south off crystal 64's column at (7, 97, 39) and landed at (5, 58, 44), a cell west of its three-wide trench, dead.
        look: new Vec3(bot._pillarUp.x + .5 + side.dx * 12, bot.entity.position.y + 1.0, bot._pillarUp.z + .5 + side.dz * 12), maxMs: 2000, tick: 25, intoFall: true, until: () => !bot.entity.onGround && bot.entity.position.y < startY - 0.5 });
    } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the water drop's step off ended: ${err.name || ''} ${String(err.message || err).slice(0, 100)}`); }
    finally { bot._dropping = false; task.interruptCheck = dropInterrupt; }
    let wet = false;
    try { wet = await recoverFall(bot, task, goal, save, { refill: true }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the water drop's landing: ${String(err.message || err).slice(0, 120)}`); }
    for (let i = 0; i < 60 && !bot.entity.onGround; i++) await sleep(50);
    const down = bot.entity.position.y <= startY - 3;
    (state.descents ||= []).push({ at: Date.now(), kind: 'drop', from: startY, to: bot.entity.position.y, wet, lost: Math.round((health - bot.health) * 10) / 10, down });
    console.log(`[end combat] the water drop ended ${down ? 'down' : 'still up'} at ${bot.entity.position.floored()}, ${wet ? 'in the water' : 'dry'}, health ${health.toFixed(1)} to ${bot.health.toFixed(1)}`);
    if (down) delete bot._pillarUp;
    save();
    // The pool taken back where the body lands (note 1535), before anything
    // walks it off: the step's start took back only what stood within reach
    // then, and 25588 (dragon-92, 2026-10-13 23:16Z, five crystals broken)
    // landed its 26-block drop in the pool at (-15, 62, -36), was 42 blocks
    // off at its next question ten seconds later, and poured its next pool
    // with '0 full buckets left'.
    // Out of the trench first (note 1559): a body in the pool's water wades at
    // half a walk and climbs its wall at a swim, and 25588 (dragon-109,
    // 2026-10-14 02:16Z, crystal 114 broken) landed in its trench at (-17, 59,
    // -37), took a fireball's cloud there, 'evade breath straight' twice, moved
    // 1.4 blocks in four seconds, 20 to none. The rim is a block up and a block
    // or two off: forward and the jump, toward the column's foot.
    if (down && inWater()) await outOfTheWater();
    if (down && countOf(bot, 'bucket') > 0 && !breathThreat(bot) && !dragonThreat(bot)) { try { await takeBackWaterNear(); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } }
    return down;
  };
  // The way down the column as Jev chose it for this fight (column_descent): the drop where chosen and possible, the dig otherwise.
  // Up two instead of down on a short column (note 1590): the cloud lies at
  // the feet, the dig down ends in it for three blocks and the column has
  // fewer, and two laid are under a second. 25588 (dragon-134, 2026-10-14
  // 06:35Z, two crystals broken) stood one up its column at (-13, 63, 42)
  // with no pool under the way and no bucket, dug its one block down into
  // the cloud, 20 to 14 to 8.6 to 2.8 to none in three seconds, 24 blocks carried.
  const upOutOfBreathOnShortColumn = async () => {
    if (breathThreat(bot)?.name !== 'area_effect_cloud' || blocksCarried(bot) < 2 || columnDepth() >= 4) return false;
    goal.step = { action: 'up_out_of_breath_on_column', health: bot.health }; save();
    const from = Math.floor(bot.entity.position.y);
    try { await require('./pillar-recovery').pillarUp(bot, task, from + 2, { dig: actions.dig, maxBlocks: 2, threats: false }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
    console.log(`[end combat] up out of the breath on the short column: ${Math.floor(bot.entity.position.y) - from} blocks up at ${bot.entity.position.floored()}, ${bot.health.toFixed(1)} health`);
    return true;
  };
  const wayDown = async (opts) => {
    if (await upOutOfBreathOnShortColumn()) return;
    const dropChosen = state.descent?.pick === 'water_drop' && Date.now() - state.descent.at < 30 * 60000;
    // From the column's own cell whatever onOwnPillar says of it (note 1573):
    // at the top against a thick pillar, the roof's post and the obsidian
    // can close every side it counts, and 25588 (dragon-121, 2026-10-14
    // 04:15Z, crystal 108 broken) at (16, 103, -36) with its pool at (19, 59,
    // -36) was dug down 44 blocks without a look at the drop.
    if (dropChosen && (onOwnPillar() || onColumnCell())) {
      // In the cloud with the drop's side walled by the pocket (note 1577): two down first, out of the cloud in a second, the walls dug after. Three wall blocks dug in the cloud are nine health.
      if (breathThreat(bot)?.name === 'area_effect_cloud' && waterDropSide()?.clearFirst) { console.log(`[end combat] the breath in the pocket at ${bot.entity.position.floored()}: two down out of it before the drop's wall is dug`); await digDownColumn({ limit: 2 }); }
      if (!onOwnPillar()) { const f = bot.entity.position.floored(); console.log(`[end combat] on the column's cell at ${f} but not 'on own pillar': under ${bot.blockAt(f.offset(0, -1, 0))?.name}, ${[[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => bot.blockAt(f.offset(dx, -1, dz))?.boundingBox !== 'block').length} open sides at the feet`); }
      if (await waterDrop({ inCloud: breathThreat(bot)?.name === 'area_effect_cloud' })) return;
      // Too high for the drop: dug down to where a dry fall is borne, then the
      // drop (note 1507). 25588 (dragon-76, 2026-10-13 19:33Z) at 82 was
      // refused the drop of 23 and dug the whole column, the drop coming only
      // when the breath found it at 73.
      if (waterDrop.tooHighBy > 0) {
        await digDownColumn({ limit: Math.min(waterDrop.tooHighBy, opts?.limit ?? 64) });
        if (onOwnPillar() && await waterDrop()) return;
      }
    }
    await digDownColumn(opts);
  };
  // Jev's choice of the way down, once a fight (note 1484): asked at the
  // foot before the climb, where there is time for it; held half an hour.
  const descentChoice = async (lift) => {
    if (!client || (state.descent && Date.now() - state.descent.at < 30 * 60000)) return;
    const water = countOf(bot, 'water_bucket');
    const dug = (state.descents || []).filter(d => d.kind === 'dig'), dropped = (state.descents || []).filter(d => d.kind === 'drop');
    const record = (list, what) => list.length ? ` This fight's ${list.length} ${what}${list.length === 1 ? '' : 's'}: ${list.filter(d => d.down).length} down, ${list.filter(d => d.fell).length} fell, ${Math.round(list.reduce((n, d) => n + (d.lost || 0), 0) * 10) / 10} health lost in all.` : '';
    const tree = {
      dig_down: { description: `Come down the column after each crystal by digging the block under the feet, one at a time, about a second and a half a block, ${lift} blocks here, crouched with the shield up through the dragon's passes. The breath's cloud lands on the column where the body stands, 6 health a second whatever is worn, and every blow of it knocks the body 0.4 away from the dragon and lifts it: on a column one wide two blows put the body off it. On 2026-10-13 25588 fell off its column in the breath five times this way (dragon-59, 61, 62, 63, 64), 10 to 19 blocks, three times to its death; the dig itself brought 14 blocks down safely in most descents.${record(dug, 'dig')}` },
      water_drop: { description: `Come down the column after each crystal by stepping off its edge onto the island by its foot, ${lift} blocks down: a bucket of water is poured at the column's foot before the climb and the body lands in that pool unhurt, the second bucket poured under the body in the last blocks of the fall if the pool is missed; the buckets are filled again from the water after. ${water} water bucket${water === 1 ? '' : 's'} carried. A second and a half in the air instead of twenty seconds on the column. Where the water is not poured in time (one drop in six so far has landed dry) the fall of ${lift} blocks takes about ${Math.max(0, lift - 3)} health; a drop is taken from any height, the pool and the bucket its two chances. The column's blocks are left standing; the next climb's blocks are dug from the island (quarry_blocks). Chosen, it is also the way out of the breath's cloud at the feet on the column: off at once, not three blocks dug in it.${record(dropped, 'drop')}` },
    };
    try {
      const decision = await decide('column_descent', { client, bot, task, goal, save, tree, interrupt: check, state: { lift, waterBuckets: water, health: bot.health, descents: (state.descents || []).slice(-6) } });
      if (decision.stale) return;
      state.descent = { pick: decision.path.at(-1), at: Date.now() }; save();
      console.log(`[end combat] the way down this fight: ${state.descent.pick}`);
    } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the way down was not chosen: ${String(err.message || err).slice(0, 100)}`); }
  };
  // The pass held through on the column, crouched with the shield up, a
  // second and a half (note 1414).
  const holdOnColumn = async () => {
    // The roof first, on the bot's own column (note 1445): the dragon that
    // comes at the column breathes at it, and the fireball not seen in
    // flight bursts at the feet. 25588 (dragon-26, 2026-10-13 09:16Z) took
    // the first cloud at its feet, 20 to 14, before any fireball was seen,
    // and the roof laid against the second came too late.
    if (onOwnPillar() && !onObsidianTop()) { try { await roofOverhead(); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } }
    // And the pocket's walls (note 1575), from 70 up (the island's top is 64 and under; every carry that killed began at 71 to 95).
    // Only against the dragon's body coming, never against a fireball (note 1584): the cloud reaches through the walls, and a body sealed in with it has seconds of digging to get out. 25588 (dragon-127, 2026-10-14 05:13Z) died in its first pocket so; dragon-130 (05:49Z) left one at 0.3 health.
    if (onOwnPillar() && !onObsidianTop() && bot.entity.position.y >= 70 && dragonThreat(bot) && !breathThreat(bot)) {
      try { const t0 = Date.now(), r = await pocketOnColumn(); console.log(`[end combat] a pocket against the wings on the column at ${bot.entity.position.floored()}: ${r.laid} blocks laid, ${r.closed} of 4 sides closed, ${Date.now() - t0} ms, ${blocksCarried(bot)} blocks left`); }
      catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
    }
    goal.step = { action: 'hold_on_pillar', hazard: endEmergency(bot), health: bot.health }; save();
    const shield = bot.inventory.slots?.[45]?.name === 'shield' || bot.inventory.items().some(i => i.name === 'shield');
    try {
      if (shield && bot.inventory.slots?.[45]?.name !== 'shield') { const it = bot.inventory.items().find(i => i.name === 'shield'); if (it) await bot.equip(it, 'off-hand'); }
      bot.setControlState?.('sneak', true);
      if (shield) bot.activateItem?.(true);
      // Faced the whole hold (note 1441): the shield stops only what comes
      // from in front, and the dragon crosses the column in a second. 25588
      // (dragon-23, 2026-10-13 08:41Z, leather) took 20 to 0.3 in one pass.
      // Let go the moment the breath is at the feet (note 1478): the roof is one
      // block over the head, and a ball from a dragon flying low passes under
      // its edge and bursts on the body, its cloud on the top. 25588
      // (dragon-60, 2026-10-13 15:14Z, full iron) roofed its column at 65,
      // held crouched at 63 through two such holds, the cloud at its feet
      // the whole time, and took 20 to 14.6 to 9.6 to 3.9 to none in three
      // seconds, the dig down never begun. The hold tells its caller 'cloud'.
      const was = bot.health;
      for (let n = 0; n < 15; n++) {
        task.check();
        if (breathThreat(bot)?.name === 'area_effect_cloud' || bot.health < was - 0.5) return 'cloud';
        const d = Object.values(bot.entities).find(e => e.name === 'ender_dragon' && live(bot, e));
        if (d && typeof bot.lookAt === 'function') { try { await bot.lookAt(d.position.offset(0, 2, 0), true); } catch (_) { /* looked already */ } }
        await sleep(100);
      }
      return 'held';
    } finally { try { bot.deactivateItem?.(); } catch (_) { /* nothing held */ } bot.setControlState?.('sneak', false); }
  };
  // A hold ended by the breath at the feet: three down the column, out of it.
  // The dragon charging the column (phase 8) with the pool below (note 1562):
  // off into it at once, not a hold. The hold, crouched with the shield, stands
  // the breath's knock; the charge is the dragon's body, and it carries what it
  // strikes. 25588 (dragon-112, 2026-10-14 02:39Z, two crystals broken) held
  // on its column at 71, 'hold on pillar', took the body twice (20 to 17.3 to
  // 15.5) and was carried 30 blocks to y 87 and dropped on the western rim.
  const chargeDrop = async () => {
    const d = dragonThreat(bot);
    if (!d || metadata(bot, d, 'phase') !== 8 || state.descent?.pick !== 'water_drop' || !state.pool || Date.now() - state.pool.at > 15 * 60000 || !(onOwnPillar() || onObsidianTop())) return false;
    console.log(`[end combat] the dragon charges the column at ${bot.entity.position.floored()}, ${Math.round(d.position.distanceTo(bot.entity.position))} off, the pool below: off into it`);
    goal.step = { action: 'charge_drop', health: bot.health }; save();
    return waterDrop();
  };
  const holdOrDown = async () => {
    if (await chargeDrop()) return;
    if (await holdOnColumn() !== 'cloud') return;
    // The cloud below the feet, the body out of it (note 1576): the way down would end in it; the hold stays.
    if (breathThreat(bot)?.name !== 'area_effect_cloud') { const c = cloudUnderfoot(3); if (c) { console.log(`[end combat] the hold stays up at ${bot.entity.position.floored()}: ${cloudUnderfootSays(c)}`); return; } }
    console.log(`[end combat] the breath at the feet during the hold at ${bot.entity.position.floored()}, health ${bot.health.toFixed(1)}: down the column`);
    goal.step = { action: 'down_out_of_breath', health: bot.health }; save();
    await wayDown({ limit: 3 });
  };
  const respond = async () => {
    // Emergency handlers must not trip the guard that interrupted ordinary
    // planning. They still retain cancellation and the caller's guard.
    task.interruptCheck = oldInterrupt;
    if (fallDanger(bot)) await recoverFall(bot, task, goal, save);
    // On its own pillar, nothing but air round the feet (note 1414): there
    // is no walking escape from the dragon's pass, and looking for one threw
    // 'No surveyed walking escape' twice a second for as long as the dragon
    // circled near (the arena's drill of 2026-10-13, 03:28Z, thirteen up a
    // pillar beside a crystal's). The pass is held through instead, crouched
    // with the shield up, a second and a half; the step then goes on, to the
    // climb or the way down.
    else if (onOwnPillar() && ['dragon_breath_cloud', 'incoming_dragon_fireball'].includes(endEmergency(bot))) {
      // The breath on the column, or a fireball coming (its cloud lands where
      // the bot stands): a shield does not stop it (Instant Damage, magic),
      // the drill of 2026-10-13 (05:35Z) died holding in it, 4 a time to none,
      // and 25588 (dragon-9, 06:05Z) held with the shield up for a fireball,
      // 20 to 8 in six seconds, and died of the next at 06:06Z. The cloud lies
      // on the top; three blocks down the column is under it.
      // A fireball coming: a roof over the head first (note 1442), laid
      // against the obsidian beside the column; the ball bursts on the roof
      // and its cloud lies on top of that, three blocks over the feet, where
      // the body is not. Of the 84 blows the dragon landed on 25588 today
      // (dragon-6 to dragon-23, 2026-10-13), 70 were its breath, 6 a second
      // whatever is worn; the dig down out of it was three blocks and some
      // three seconds, 18 health. With no roof to lay, the dig as before.
      if (endEmergency(bot) === 'incoming_dragon_fireball' && await roofOverhead()) {
        goal.step = { action: 'roof_against_fireball', health: bot.health }; save();
        await holdOrDown();
      } else {
        goal.step = { action: 'down_out_of_breath', health: bot.health }; save();
        await wayDown({ limit: 3 });
      }
    }
    // On the obsidian top (no walk off it either): the breath or a fireball
    // sends the bot back to its column and three down; a pass is held through.
    else if (onObsidianTop() && ['dragon_breath_cloud', 'incoming_dragon_fireball'].includes(endEmergency(bot))) {
      goal.step = { action: 'off_the_top_out_of_breath', health: bot.health }; save();
      if (await backToColumn()) await wayDown({ limit: 3 });
    }
    else if (onOwnPillar()) await holdOrDown();
    else if (onObsidianTop()) { if (await holdOnColumn() === 'cloud' && await backToColumn()) await wayDown({ limit: 3 }); }
    else {
      // Out of the dragon's way by ground no mob stands near, and where
      // there is none, by any ground (note 1174): an enderman's blow is
      // seven, the dragon's head ten and again each second it is stood in.
      // The rehearsal of 2026-10-04 (04:44 to 04:48Z), turned endermen
      // seven to twenty blocks off, found "no surveyed walking escape"
      // twenty-six times and stood by the fountain as the dragon came down
      // on it, 20 health to none in four touches.
      // In the breath on the ground (note 1560): one short run, and where it
      // goes nowhere, down or up at once, not a second survey. The breath's
      // cloud is read a tick late, and each survey with its run is a second
      // and a half in a cloud that takes six a second: 25588 (dragon-110,
      // 2026-10-14 02:27Z, two crystals broken) stood among its quarry's pits,
      // 'evade breath straight' four times, moved nowhere, 20 to none;
      // dragon-111 (02:28Z) on the ledge under the entry platform the same,
      // 20 to none in three seconds, the way up never reached.
      const inBreath = () => breathThreat(bot)?.name === 'area_effect_cloud' || (breathThreat(bot) && bot._lastDragonHurtAt && Date.now() - bot._lastDragonHurtAt < 1500);
      try { await evadeDragon(bot, task, goal, save, { allowed: p => policy.allowedPoint(p) && safeFromHostiles(bot, p, endMobs(bot)), timeoutMs: inBreath() ? 700 : 1600 }); }
      catch (err) {
        if (err.name !== 'NoEscape') throw err;
        try { if (inBreath()) throw Object.assign(new Error('No surveyed walking escape from the dragon on loaded terrain'), { name: 'NoEscape' }); await evadeDragon(bot, task, goal, save, { allowed: p => policy.allowedPoint(p) }); }
        catch (err2) {
          if (err2.name !== 'NoEscape' || !actions.dig) throw err2;
          // No walk out of the cloud on the ground (note 1475): two blocks dug
          // under the feet put the body under it, as the column's way does.
          // 25588 (dragon-56, 2026-10-13 14:39Z) stood in the cloud on the
          // island's rough eastern ground three seconds, 20 to none, with
          // 'No surveyed walking escape' each tick.
          // Only on thick ground well in from the rim (note 1477): six solid under
          // the feet and no void within four. 25588 (dragon-58, 2026-10-13
          // 14:54Z) dug two under its feet in a cloud on the eastern slope at
          // (53, 43, -23), the island two blocks thick there, and fell through
          // into the void.
          const feet0 = bot.entity.position.floored();
          const thick = [1, 2, 3, 4, 5, 6].every(dy => bot.blockAt(feet0.offset(0, -dy, 0))?.boundingBox === 'block');
          // Up two on the blocks carried (note 1557) where the ground is too thin
          // to dig and no run is to be had: the cloud lies half a block deep on
          // the ground, and a body two blocks up is out of it. 25588 (dragon-106,
          // 2026-10-14 01:26Z) stood on the ledge under the entry platform at
          // (88, 45, 2), the void beside every cell, 'No surveyed walking
          // escape' three times, 28 blocks carried, and died in the cloud,
          // 20 to none in three seconds.
          // Up two first wherever two blocks are carried (note 1583), the dig
          // only without them: two blocks laid are under a second, two dug
          // are three with a stone pickaxe, and the cloud is six a second.
          // 25588 (dragon-129, 2026-10-14 05:41Z, three crystals broken)
          // stood in the cloud at (-32, 59, -31) on thick ground by crystal
          // 90's foot with 17 blocks carried, no run found, 13 to 7.5 to 1.7
          // to none in two seconds, nothing pressed; dragon-124 and 110 the
          // same on the island's ground.
          if (inBreath() && blocksCarried(bot) >= 2) {
            goal.step = { action: 'up_out_of_breath_on_ground', health: bot.health }; save();
            const from = Math.floor(bot.entity.position.y);
            try { await require('./pillar-recovery').pillarUp(bot, task, from + 2, { dig: actions.dig, maxBlocks: 2, threats: false }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
            console.log(`[end combat] up out of the breath on ${thick ? 'the ground' : 'thin ground'}: ${Math.floor(bot.entity.position.y) - from} blocks up at ${bot.entity.position.floored()}, ${bot.health.toFixed(1)} health`);
            return;
          }
          if (inBreath() && thick && voidEdge(bot, bot.entity.position, 4) === null) {
            goal.step = { action: 'down_out_of_breath_on_ground', health: bot.health }; save();
            for (let n = 0; n < 2; n++) { const under = bot.entity.position.floored().offset(0, -1, 0); if (bot.blockAt(under)?.boundingBox !== 'block' || bot.blockAt(under.offset(0, -1, 0))?.boundingBox !== 'block') break; try { await actions.dig(bot, task, under, { dropInto: true, openPit: true, requireDrops: false }); } catch (e3) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(e3.name)) throw e3; break; } for (let i = 0; i < 20 && !bot.entity.onGround; i++) await sleep(50); }
            return;
          }
          throw err2;
        }
      }
    }
  };
  // Standing in the water poured at its feet, a turned enderman is no
  // reason to hold: water hurts one and it teleports off rather than cross
  // it, as a player stands in a bucket's water and shoots on. The place is
  // then judged by everything else about (the dragon, its breath, a
  // crystal, any other mob). The rehearsal of 2026-10-03 (23:48 to 23:51Z)
  // stood in its water with three turned endermen seven to thirteen blocks
  // off, "observe, the only way offered", the dragon circling at 166.5 of
  // 200 and 187 arrows carried: no shot, no route and no strike while one
  // of them stayed within twenty (note 1136).
  const inWater = () => { const feet = bot.entity.position.floored(); return bot.blockAt(feet)?.name === 'water' && bot.blockAt(feet.offset(0, -1, 0))?.boundingBox === 'block' && bot.blockAt(feet.offset(0, 1, 0))?.name !== 'water'; };
  const safeHere = () => {
    const p = bot.entity.position;
    if (safeEndPoint(bot, p)) return true;
    if (!inWater()) return false;
    const others = endMobs(bot).filter(e => e.name !== 'enderman');
    return safeFromHostiles(bot, p, others) && others.every(e => p.distanceTo(e.position) >= 20) && endHazards(bot).every(({ entity, radius }) => hazardDistance(p, entity) > radius);
  };
  // Crouched whenever the bot stands on its column or an obsidian top and no
  // move of its own is under way (note 1480): a crouched body on the ground is
  // not moved off its block's edge by anything, its own keys or a push (the
  // physics backs the whole of the step off the edge), and the dragon's wing
  // passing through the column pushes without a blow: the dragon shoves
  // whatever its parts touch, and strikes only a body not hurt by a mob
  // within two ticks, which the breath at the feet is. 25588 (dragon-59,
  // 2026-10-13 15:06Z) and (dragon-61, 15:37Z), both digging down out of the
  // breath with no key held, drifted 0.8 to 1.1 off the column's middle in
  // half a second with no blow recorded and fell 18 and 10 blocks, dragon-59
  // to its death. The climb's jumps (a move of their own) are left upright.
  // Water standing within reach of the eye goes back into an empty bucket (notes 1495, 1535); the cell taken, or null.
  const takeBackWaterNear = async ({ sparePool = false } = {}) => {
    if (countOf(bot, 'bucket') < 1) return null;
    const { sourceWater, fillWaterBucket } = require('./water');
    const eye = bot.entity.position.offset(0, 1.62, 0);
    // Not the pool poured for the coming drop (note 1574), nor water within two of it.
    const pool = sparePool && state.pool && Date.now() - state.pool.at < 15 * 60000 ? state.pool : null;
    const near = bot.findBlocks({ matching: bot.registry.blocksByName.water.id, maxDistance: 5, count: 8, useExtraInfo: sourceWater })
      .filter(p => eye.distanceTo(p.offset(.5, .5, .5)) <= 4.3 && !(pool && Math.abs(p.x - pool.x) <= 2 && Math.abs(p.z - pool.z) <= 2)).sort((p, q) => eye.distanceTo(p) - eye.distanceTo(q))[0];
    if (!near) return null;
    await fillWaterBucket(bot, task, near, { timeoutMs: 1500 });
    console.log(`[end combat] water left at ${near} taken back into the bucket (${countOf(bot, 'water_bucket')} full carried)`);
    if (state.pool && near.x === state.pool.x && near.z === state.pool.z) { delete state.pool; save(); }
    return near;
  };
  // The dragon's hurts on the body, timed (note 1560): the breath's cloud is read a tick late and its hurt is not.
  if (!bot._dragonHurtHook && bot._client?.on) {
    bot._dragonHurtHook = true;
    bot._client.on('damage_event', packet => { try { if (packet?.entityId === bot.entity?.id) { const cause = bot.entities?.[(packet.sourceCauseId || 0) - 1]; if (cause?.name === 'ender_dragon') bot._lastDragonHurtAt = Date.now(); } } catch (_) { /* nothing */ } });
  }
  const crouchKeeper = setInterval(() => {
    try { if (!bot._controller && !bot._dropping && bot.entity?.onGround && (onOwnPillar() || onObsidianTop()) && !bot.controlState?.sneak) bot.setControlState?.('sneak', true); } catch (_) { /* nothing to hold */ }
  }, 50);
  try {
    // Water left standing within reach goes back into an empty bucket at the
    // step's start, with no dragon or breath upon the bot (note 1495): the
    // buckets go down for landings, for endermen and for the breath, and
    // what any of them leaves is the next landing's bucket. 25588 (dragon-68,
    // 2026-10-13, four crystals broken) lost one bucket at 17:01Z in an
    // evasion and the other at 17:13Z, each the water left where it was
    // poured, and died at 17:21Z, 'no water bucket carried', on its column.
    // The body in water, or its breath going, at the step's start (note 1570): out first.
    if ((inWater() || (bot.oxygenLevel ?? 20) < 18) && !onOwnPillar()) { try { await outOfTheWater(); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } }
    if (countOf(bot, 'bucket') > 0 && !breathThreat(bot) && !dragonThreat(bot)) {
      try {
        const { fillWaterBucket } = require('./water');
        const eye = bot.entity.position.offset(0, 1.62, 0);
        const near = await takeBackWaterNear({ sparePool: true });
        // The pool poured for a drop, walked back to within ten (note 1519):
        // left where it was poured it is a bucket gone, and 25588 (dragon-82,
        // 2026-10-13 20:49Z) poured its third pool with '0 full buckets left',
        // the second standing at (-28, 61, -25) where the climb was given up.
        // Every pool and clutch left behind, remembered and walked back to (note
        // 1564), not the drop's pool alone: 25588 (dragon-113, 2026-10-14 02:51Z)
        // caught its 45-block drop with the bucket at (8, 61, -33), landed at
        // 17 health with the dragon coming, and that water was never a pool to
        // return to; its next pour at (-8, 59, 39) was left when the climb went
        // up another column; both buckets empty by the fifth crystal.
        if (!near && Array.isArray(state.poolsLeft) && state.poolsLeft.length && bot.health >= 10 && !onOwnPillar()) {
          state.poolsLeft = state.poolsLeft.filter(w => Date.now() - w.at < 15 * 60000 && bot.blockAt(new Vec3(w.x, w.y, w.z))?.name === 'water');
          const here = bot.entity.position, w = state.poolsLeft.map(w => ({ w, d: here.distanceTo(new Vec3(w.x + .5, w.y, w.z + .5)) })).filter(x => x.d <= 16).sort((a, b) => a.d - b.d)[0];
          if (w) {
            const p = new Vec3(w.w.x, w.w.y, w.w.z);
            try { await actions.navigate(bot, task, new goals.GoalNear(p.x, p.y, p.z, 2), { timeoutMs: 8000, stallMs: 3000 }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the walk back to the water left at ${p} from ${bot.entity.position.floored()}: ${String(err.message || err).slice(0, 80)}`); }
            const eye2 = bot.entity.position.offset(0, 1.62, 0);
            if (eye2.distanceTo(p.offset(.5, .5, .5)) <= 4.3) { await fillWaterBucket(bot, task, p, { timeoutMs: 1500 }); console.log(`[end combat] the water left at ${p} taken back into the bucket (${countOf(bot, 'water_bucket')} full carried)`); state.poolsLeft = state.poolsLeft.filter(x => x !== w.w); if (state.pool && state.pool.x === p.x && state.pool.z === p.z) delete state.pool; save(); }
          }
        }
        if (!near && state.pool && Date.now() - state.pool.at < 15 * 60000) {
          const p = new Vec3(state.pool.x, state.pool.y, state.pool.z), d = bot.entity.position.distanceTo(p.offset(.5, 0, .5));
          if (bot.blockAt(p)?.name !== 'water') delete state.pool;
          // Not under ten health (note 1554): the walk is out in the open with the dragon about, and one breath is six. 25588 (dragon-103, 2026-10-14 01:14Z, two crystals broken) walked back to its pool at (-11, 59, 36) at 5.3 health and took the breath there, dead.
          else if (d <= 16 && !onOwnPillar() && bot.health >= 10) {
            try { await actions.navigate(bot, task, new goals.GoalNear(p.x, p.y, p.z, 2), { timeoutMs: 8000, stallMs: 3000 }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] the walk back to the pool at ${p} from ${bot.entity.position.floored()}: ${String(err.message || err).slice(0, 80)}`); }
            if (eye.distanceTo(p.offset(.5, .5, .5)) <= 4.3 || bot.entity.position.offset(0, 1.62, 0).distanceTo(p.offset(.5, .5, .5)) <= 4.3) { await fillWaterBucket(bot, task, p, { timeoutMs: 1500 }); console.log(`[end combat] the pool at ${p} taken back into the bucket (${countOf(bot, 'water_bucket')} full carried)`); delete state.pool; save(); }
          }
        }
      } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
    }
    // What the columns have cost this fight (note 1440): every blow taken on
    // the bot's own column or an obsidian top, told on the climb's option.
    { const h = bot.health, was = state.lastHealthSeen; state.lastHealthSeen = h;
      if (Number.isFinite(was) && h < was - 0.05 && (onOwnPillar() || onObsidianTop())) { const c = state.columnDamage ||= { hits: 0, total: 0, max: 0 }; const d = Math.round((was - h) * 10) / 10; c.hits++; c.total = Math.round((c.total + d) * 10) / 10; c.max = Math.max(c.max, d); save(); } }
    if (endEmergency(bot)) { await respond(); return; }
    task.interruptCheck = () => {
      oldInterrupt?.();
      if (dimension(bot) !== 'end' || bot.health <= 0) throw blocked('End combat interrupted by dimension change or death');
      checkEndEmergency(bot);
    };
    if (safeHere()) {
      if (await maintainVitals(bot, task, action => { goal.survivalAction = { ...action, at: new Date().toISOString() }; save(); }, { client, goal, save })) return;
    }
    // Hungry with nothing to eat, the fight goes on (note 1381): under
    // eighteen health does not come back, which every question says, and
    // standing still in the End brings no food. This stopped the fight at
    // every step under hunger 16: the arena's drill of 2026-10-06 19:27Z
    // (full iron, a bow, 16 arrows, 48 snowballs, no food, hunger 15) stood
    // on the island with "End combat has no carried food to restore hunger"
    // at each step, and the End's kit lets a bot go with no food at all.
    // No survival layer in the End: the game loop hands the dimension to
    // this step, so a turned enderman is answered here, with the sword,
    // under the same checks as the rest of the fight. In the rehearsal the
    // survival layer answered instead and sealed the bot in where the
    // dragon's breath pooled; that is not how the run plays it.
    const sword = bot.inventory.items().find(i => /_sword$/.test(i.name) && durable(bot.registry, i));
    // The sword on its cooldown and the shield up between swings, the way
    // the survival layer fights (combat.js defendNearby): swinging alone,
    // the recorded rehearsal traded blow for blow with an enderman through
    // iron and lost, 20 health to none in six seconds with the dragon at 26.
    const shielded = bot.inventory.slots?.[45]?.name === 'shield';
    const defendHere = async ms => {
      const until = Date.now() + ms;
      if (sword && bot.heldItem?.name !== sword.name) { await bot.equip(sword, 'hand'); check(); }
      try {
        while (Date.now() < until) {
          check();
          const target = hostileEntities(bot, 6).filter(e => live(bot, e)).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
          if (!target) break;
          if (sword && canStrike(bot, target)) { if (await defendNearby(bot, task, goal, save)) { progress = true; state.defended = (state.defended || 0) + 1; } else await sleep(50); }
          // Shield up and eyes on its legs while it comes: a look at an
          // enderman's head is what turns one.
          else { if (shielded) raiseShield(bot); await bot.lookAt(target.position.offset(0, (target.height || 1.8) * .25, 0), true); await sleep(50); }
        }
      } finally { lowerShield(bot); }
    };
    // The water poured for the last enderman comes back once none is near;
    // left behind, it is lost, and the bucket goes on empty.
    // Taken back once no turned enderman is within eight (note 1468): the
    // End keeps a hostile within sixteen at all hours, and 25588 (dragon-47,
    // 2026-10-13 13:04Z, crystals 11 and 94 broken) fell 27 from a pillar's
    // top with both buckets empty, the water of a pour and of a landing left
    // where it lay.
    if (state.water && !require('./end-pocket').angryEndermen(bot, 8, hostileEntities).some(e => live(bot, e))) {
      // Walked back to within twelve (note 1542), as the drop's pool is (note
      // 1519): forgotten at four blocks, the water was a bucket gone, and
      // 25588 (dragon-95, 2026-10-13 23:56Z) poured for an enderman at about
      // (15, 61, -24) in a walk, moved on, and poured its next pool with '0
      // full buckets left', no word of the pour in the log.
      const at = vector(state.water.at), far = bot.entity.position.distanceTo(at);
      if (bot.blockAt(at)?.name !== 'water') { delete state.water; }
      else {
        if (far > 4 && far <= 12 && countOf(bot, 'bucket') > 0 && bot.health >= 10) { try { await actions.navigate(bot, task, new goals.GoalNear(at.x, at.y, at.z, 2), { timeoutMs: 8000, stallMs: 3000 }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; } }
        const taken = await takeWaterBack(bot, check, state.water.at);
        if (taken) console.log(`[end combat] the enderman's water at ${at} taken back into the bucket (${countOf(bot, 'water_bucket')} full carried)`);
        if (taken || countOf(bot, 'bucket') === 0 || bot.entity.position.distanceTo(at) > 12) delete state.water;
      }
      save();
    }
    // Two or more turned, or one with the health low: the pocket two high,
    // before any water goes down (poured first, it ran into the shaft and the
    // cap sealed the bot in to drown: the rehearsal, 2026-09-24).
    // they cannot follow into (end-pocket.js), not the sword.
    const { endPocket, angryEndermen } = require('./end-pocket');
    const angry = angryEndermen(bot, 12, hostileEntities).filter(e => live(bot, e));
    if (actions.dig && !inWater() && (angry.length >= 2 || (angry.length && bot.health < 10)) && !(state.pocketFailedAt > Date.now() - 20000)) {
      try {
        if (await endPocket(bot, task, { dig: actions.dig, check, hostileEntities, report: a => { goal.step = a; save(); } })) { state.pockets = (state.pockets || 0) + 1; save(); return; }
      } catch (err) { if (['Cancelled', 'NeedsAir'].includes(err.name)) throw err; state.pocketFailedAt = Date.now(); save(); }
    }
    const turned = hostileEntities(bot, 12).find(e => live(bot, e) && e.name === 'enderman');
    // Poured again where the last water is gone or far (note 1462): the
    // End's endermen keep a hostile within sixteen blocks at all hours, the
    // water was never taken back, and one pour a fight was all there was.
    // 25588 (dragon-42, 2026-10-13 12:11Z, full iron, two buckets carried)
    // stood 'end_hold' among three endermen at 6, 10 and 12 blocks, poured
    // nothing, and took 4 a second to none.
    const lastWater = state.water && vector(state.water.at);
    const waterStands = lastWater && bot.blockAt(lastWater)?.name === 'water' && lastWater.distanceTo(bot.entity.position) <= 6;
    if (turned && !waterStands) {
      const at = await pourAtFeet(bot, check, { urgent: turned.position.distanceTo(bot.entity.position) <= 4 });
      if (at) { state.water = { at: { ...at }, poured: Date.now() }; state.pours = (state.pours || 0) + 1; goal.step = { action: 'end_water', against: 'enderman', at: { ...at } }; save(); console.log(`[end combat] water poured at ${vector(at)} against the enderman ${Math.round(turned.position.distanceTo(bot.entity.position))} blocks off (${countOf(bot, 'water_bucket')} full left)`); }
    }
    // Within eight (note 1462): one at six struck the bot held 'unsafe' with none within six.
    // Six again (note 1467): at eight the defence began and its loop, wanting six, ended at once, 21 passes a second (dragon-46).
    const attacker = hostileEntities(bot, 6).find(e => live(bot, e) && e.name !== 'ender_dragon');
    if (attacker && sword && !(inWater() && attacker.name === 'enderman' && !canStrike(bot, attacker))) {
      goal.step = { action: 'end_defend', target: attacker.name, distance: Math.round(attacker.position.distanceTo(bot.entity.position) * 10) / 10 }; save();
      await defendHere(2000); return;
    }
    const crystals = observeArena(bot, state);
    state.observedCrystals = crystals.map(e => ({ id: e.id, position: { ...e.position } }));
    state.dragon = dragon && { id: dragon.id, position: { ...dragon.position }, health: beforeDragon, phase: metadata(bot, dragon, 'phase') };
    // Back onto the column's cell before the ways are weighed (note 1563): a
    // body on its own column with its middle over the edge stands 'on air',
    // and no way down is offered from a cell with nothing under it. 25588
    // (dragon-113, 2026-10-14 02:48Z, two crystals broken) stood so at (8,
    // 103, -35) beside its column at (8, -36), 'only observe' four times over,
    // 38 blocks carried and the dragon coming; dragon-92 (23:08Z) the same at
    // (36, 67, -28).
    if (onOwnPillar() && bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))?.boundingBox !== 'block') {
      try { if (await centreOnColumn(0.3)) console.log(`[end combat] back onto the column's cell at ${bot.entity.position.floored()} from over its edge`); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
    }
    const tree = {}, safe = safeHere(), wet = safe && !safeEndPoint(bot, bot.entity.position);
    const guardShot = () => { check(); if (!safeHere()) throw new Error('End firing position became unsafe'); };
    // A turned enderman within sixteen is Jev's question (note 1551), not the
    // reflex's alone: the reflex fights within six for two seconds and the
    // step goes back to the quarry, the walk or the meal, and the enderman
    // comes again. 25588 (dragon-97, 2026-10-14 00:36Z, four crystals broken)
    // took six blows of 4.5 in ten seconds, three sword blows landed, both
    // buckets in pools, Jev asked about the quarry and a watch; dragon-100
    // (00:52Z) took six in thirteen seconds, Jev choosing a meal twice.
    {
      const foe = hostileEntities(bot, 16).filter(e => live(bot, e) && e.name === 'enderman').sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
      if (foe && sword) {
        const off = Math.round(foe.position.distanceTo(bot.entity.position) * 10) / 10, buckets = countOf(bot, 'water_bucket');
        const facts = { endermanBlocksOff: off, endermanHealth: 40, swordBlow: 7, blowsToKill: 6, itsBlowThroughIron: 4.5, health: bot.health, waterBucketsCarried: buckets,
          record: 'an enderman killed 25588 four times on 2026-10-13/14 (dragon-31 in 5 s through leather, dragon-37 in 3 s, dragon-85 five blows in 4 s while the quarry dug on, dragon-97 six blows in 10 s, dragon-100 six blows in 13 s while it ate); fought with the sword from the first blow it dies in six blows, about five seconds; standing in water it takes damage and teleports off and does not come into it' };
        tree.fight_enderman = { description: { action: `Turn on the enderman ${off} blocks off and fight it with the ${sword.name.replaceAll('_', ' ')}: it has 40 health, a blow takes 7, six blows kill it, about five seconds; its blow takes 4.5 through iron and it teleports behind the body between blows. The shield up when it is not struck.`, ...facts },
          run: async () => { goal.step = { action: 'fight_enderman', distance: off }; save(); const until = Date.now() + 8000; while (Date.now() < until) { check(); const e = hostileEntities(bot, 16).find(x => live(bot, x) && x.name === 'enderman'); if (!e) break; if (e.position.distanceTo(bot.entity.position) > 3.5) { try { await actions.navigate(bot, task, new goals.GoalNear(e.position.x, e.position.y, e.position.z, 2), { timeoutMs: 2500, stallMs: 1200 }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; } } await defendHere(1500); } progress = true; } };
        // Not within eight of the void (note 1586): poured water runs down the slope to the rim and carries the body with it. 25588 (dragon-131, 2026-10-14 06:04Z) poured against an enderman at (35, 57, -20) on the eastern rim, was carried down the cliff in the flow from 55 to 30 and off the island, dead in the void at -221.
        const voidNear = voidEdge(bot, bot.entity.position, 8);
        if (buckets > 0 && !inWater() && voidNear === null) tree.water_at_feet = { description: { action: `Pour a bucket of water at the feet and stand in it: an enderman in water takes damage and teleports away, and will not step into it; the sword still reaches one that comes to its edge. ${buckets} water bucket${buckets === 1 ? '' : 's'} carried, this one taken back when none is near within eight. Poured water runs downhill and carries a body standing in it; no void lies within eight blocks here.`, ...facts },
          run: async () => { goal.step = { action: 'water_at_feet', against: 'enderman' }; save(); const at = await pourAtFeet(bot, check, { urgent: off <= 4 }); if (at) { state.water = { at: { ...at }, poured: Date.now() }; state.pours = (state.pours || 0) + 1; save(); console.log(`[end combat] water poured at ${vector(at)} at Jev's word against the enderman ${off} blocks off (${countOf(bot, 'water_bucket')} full left)`); } await defendHere(4000); progress = true; } };
        if (actions.dig && !inWater()) tree.hide_from_enderman = { description: { action: 'Dig a pocket two high into the ground here and wait in it: an enderman cannot follow into a space two high, and leaves off; about four seconds to dig, and the fight stands still while it waits.', ...facts },
          run: async () => { const { endPocket } = require('./end-pocket'); goal.step = { action: 'hide_from_enderman' }; save(); try { if (await endPocket(bot, task, { dig: actions.dig, check, hostileEntities, report: a => { goal.step = a; save(); } })) { state.pockets = (state.pockets || 0) + 1; progress = true; } } catch (err) { if (['Cancelled', 'NeedsAir'].includes(err.name)) throw err; state.pocketFailedAt = Date.now(); save(); } } };
      }
    }
    const shoot = async target => {
      guardShot();
      if (target === dragon && perched(bot, dragon)) throw new Error('The dragon perched before the shot');
      let explosion = false;
      const targetPosition = target.position.clone();
      const observeExplosion = packet => { if (vector(packet.center).distanceTo(targetPosition) < 3) explosion = true; };
      bot._client.on('explosion', observeExplosion);
      try {
        const result = await shot(bot, task, target, { guard: () => {
          guardShot(); if (target === dragon && perched(bot, dragon)) throw new Error('The dragon perched while drawing');
        }, velocity: target === dragon ? velocity : new Vec3(0, 0, 0), ...(target === dragon ? { holdMs: 4000 } : {}),
          // From its water the endermen about are not what stops the shot; any other mob within six is.
          ...(inWater() ? { standing: () => true, threatCheck: b => { const near = hostileEntities(b, 6).find(e => live(b, e) && e.name !== 'enderman'); if (near) throw new Error(`A ${near.name} came within six blocks`); } } : {}) });
        result.targetPosition = { ...targetPosition };
        state.shots.push(result); state.shots = state.shots.slice(-256); save();
        const until = Date.now() + Math.min(5000, Math.ceil(result.ticks * 50) + 500);
        while (Date.now() < until) { check(); if (!safeHere()) break; await sleep(50); }
        if (target.name === 'end_crystal' && Date.now() >= until) result.outcome = live(bot, target) ? 'target_remains' : 'unconfirmed_target_lost';
        if (target.name === 'end_crystal' && explosion && !live(bot, target)) {
          result.outcome = 'confirmed_crystal_explosion';
          const evidence = { at: Date.now(), id: target.id, position: { ...targetPosition }, source: 'explosion_and_entity_removed' };
          state.destroyedCrystals.push(evidence); bot.emit('end_combat', { crystal: evidence }); progress = true;
          Object.assign(state.knownCrystals[crystalKey(target)], { status: 'destroyed', confirmedAt: evidence.at });
        }
      } finally { bot._client.removeListener('explosion', observeExplosion); }
    };
    // From the top of a pillar chosen for it (pillar_throw) the footing is a
    // block wide and not a safe place by the End's rule: the throw goes on
    // there, the fall said where it was chosen (note 1344).
    const throwCrystal = async (target, { fromPillar = false } = {}) => {
      check();
      let explosion = false;
      const targetPosition = target.position.clone();
      const observeExplosion = packet => { if (vector(packet.center).distanceTo(targetPosition) < 3) explosion = true; };
      bot._client.on('explosion', observeExplosion);
      try {
        const result = await throwAt(bot, task, target, { guard: () => { check(); if (!fromPillar && !safeHere()) throw new Error('End throwing position became unsafe'); } });
        result.targetPosition = { ...targetPosition };
        state.shots.push(result); state.shots = state.shots.slice(-256); save();
        const until = Date.now() + Math.min(5000, Math.ceil(result.ticks * 50) + 500);
        while (Date.now() < until && !explosion) { check(); await sleep(50); }
        console.log(`[end combat] throw at crystal ${target.id}: ${explosion ? 'it blew' : 'it stands'}`);
        result.outcome = explosion && !live(bot, target) ? 'confirmed_crystal_explosion' : live(bot, target) ? 'target_remains' : 'unconfirmed_target_lost';
        if (result.outcome === 'confirmed_crystal_explosion') {
          const evidence = { at: Date.now(), id: target.id, position: { ...targetPosition }, source: 'explosion_and_entity_removed', by: result.item };
          state.destroyedCrystals.push(evidence); bot.emit('end_combat', { crystal: evidence }); progress = true;
          if (state.knownCrystals?.[crystalKey(target)]) Object.assign(state.knownCrystals[crystalKey(target)], { status: 'destroyed', confirmedAt: evidence.at });
        }
      } finally { bot._client.removeListener('explosion', observeExplosion); }
    };
    const wetSays = () => { const turned = hostileEntities(bot, 64).filter(e => live(bot, e) && e.name === 'enderman' && e.position.distanceTo(bot.entity.position) < 20).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position));
      return `The bot stands in the water it poured at its feet, ${turned.length} turned enderm${turned.length === 1 ? 'an' : 'en'} within twenty blocks, the nearest ${Math.round(turned[0]?.position.distanceTo(bot.entity.position) ?? 0)} off: water hurts an enderman and it teleports off rather than cross it, and the shot is drawn standing in it.`; };
    // The sword at the perched head, swing after swing at its pace, while
    // the dragon sits, the head is in reach and the place is safe.
    const strikeSafeNow = () => !endMobs(bot).some(e => live(bot, e) && e.position.distanceTo(bot.entity.position) < 8) && endHazards(bot).every(({ entity, radius }) => hazardDistance(bot.entity.position, entity) > radius);
    const strikeWhilePerched = async ms => {
      const sword = bot.inventory.items().find(i => /_sword$/.test(i.name) && durable(bot.registry, i));
      if (!sword) throw new Error('No sword carried for the perched head');
      await bot.equip(sword, 'hand'); check();
      const until = Date.now() + ms; let swings = 0;
      try {
        while (Date.now() < until) {
          check(); checkEndEmergency(bot);
          const fresh = live(bot, dragon) && perchedHead(bot, dragon);
          if (!fresh || !(safeHere() || strikeSafeNow()) || !canStrike(bot, fresh)) break;
          if (typeof bot.lookAt === 'function') await bot.lookAt(fresh.position.offset(0, .5, 0), true);
          bot.attack(fresh); swings++;
          for (let n = 0; n < 7; n++) { check(); await sleep(100); }
        }
      } finally { state.headSwings = (state.headSwings || 0) + swings; save(); }
      if (!swings) throw new Error('Perched dragon head moved out of reach');
    };
    const bow = bot.inventory.items().some(i => i.name === 'bow' && durable(bot.registry, i));
    let noShot = !safe ? `not safe here (${unsafeBecause(bot, bot.entity.position).slice(0, 3).join(', ')})` : !bow || !countOf(bot, 'arrow') ? 'no bow or arrows' : !dragon ? 'no dragon in view' : perched(bot, dragon) ? 'perched' : null;
    // A snowball or an egg breaks a crystal as an arrow does (note 1342):
    // thrown at 1.5 with more drop, it reaches about 28 blocks up. Offered
    // where no arrow is: 25593 (2026-10-06 01:49Z) chose the End with one
    // arrow and three eggs, and the arena's drill of that kit (01:53 to
    // 01:58Z) loosed its one arrow, took no crystal and only watched after.
    const throwable = THROWABLE.find(n => countOf(bot, n) > 0);
    // Snowballs or eggs carried are shots at the crystals too (note 1343).
    const throwing = !(bow && countOf(bot, 'arrow') > 0) && !!throwable;
    if (safe && throwing) {
      const left = THROWABLE.reduce((n, k) => n + countOf(bot, k), 0);
      for (const target of crystals) if (!repeatedCrystalMiss(state, target, bot.entity.position) && aimAtEntity(bot, target, new Vec3(0, 0, 0), bot.entity.position, THROWN)) tree[`throw_${target.id}`] = {
        description: { action: `Throw a ${throwable.replaceAll('_', ' ')} at an observed healing crystal along a clear line: any projectile breaks one, removing a source of the dragon's healing`, position: { ...target.position }, thrownLeft: left, crystalsInView: crystals.length }, run: () => throwCrystal(target),
      };
    }
    // Too high to throw at from the ground (a throw reaches about 28 blocks
    // up, less the farther out): up a pillar of the blocks carried until it
    // is within about 22, then thrown at from its top (note 1343). The
    // arena's drill of 2026-10-06 (02:29 to 02:45Z), full iron and 48
    // snowballs, took none of the seven crystals left on the taller pillars
    // from the ground. A knock off the top is the fall.
    if (safe && throwing && actions.dig && !Object.keys(tree).some(k => k.startsWith('throw_'))) {
      const here = bot.entity.position, carried = blocksCarried(bot);
      for (const target of crystals.filter(c => !caged(bot, c))) {
        const out = Math.hypot(target.position.x - here.x, target.position.z - here.z), up = target.position.y - here.y;
        // The least lift with a clear throw from its top (note 1344): the
        // drill of 2026-10-06 (04:06Z) went up 16 beside the pillar, 5 out,
        // and the line to the crystal 22 over it ran into the pillar's side.
        if (out > 16 || up <= 22) continue;
        let lift = 0;
        for (let l = Math.max(1, Math.ceil(up - 26)); l <= Math.min(carried, Math.ceil(up) + 1); l++) if (aimAtEntity(bot, target, new Vec3(0, 0, 0), here.offset(0, l, 0), THROWN)) { lift = l; break; }
        if (!lift) continue;
        tree[`pillar_throw_${target.id}`] = {
          description: { action: `Pillar up ${lift} blocks here on the blocks carried and throw at the healing crystal from the top, where a throw's line to it is clear: it is ${Math.round(up)} blocks up and ${Math.round(out)} out, out of a throw from the ground`,
            position: { ...target.position }, blocks: lift, blocksCarried: carried, fallFromTheTop: `a knock off the top is a fall of ${lift} blocks, about ${Math.max(0, lift - 3)} damage before armour${countOf(bot, 'water_bucket') ? ', a water bucket carried for the landing' : ''}`,
            thrownLeft: THROWABLE.reduce((n, k) => n + countOf(bot, k), 0), health: bot.health },
          run: async () => {
            const from = bot.entity.position.y;
            await require('./pillar-recovery').pillarUp(bot, task, Math.floor(bot.entity.position.y) + lift, { dig: actions.dig, maxBlocks: lift, threats: false });
            for (let n = 0; n < 3 && live(bot, target); n++) {
              check();
              const line = aimAtEntity(bot, target, new Vec3(0, 0, 0), bot.entity.position, THROWN);
              if (n === 0) console.log(`[end combat] pillar throw: up ${Math.round(bot.entity.position.y - from)} of ${lift}, the crystal ${Math.round(target.position.y - bot.entity.position.y)} up and ${Math.round(Math.hypot(target.position.x - bot.entity.position.x, target.position.z - bot.entity.position.z))} out, ${line ? 'a line' : 'no line'}`);
              if (!line) break;
              try { await throwCrystal(target, { fromPillar: true }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] pillar throw failed: ${String(err.message || err).slice(0, 160)}`); break; }
            }
          } };
      }
    }
    // A caged crystal (note 1350): up a pillar beside its pillar to its
    // height, the iron bars on the line to it dug out with the pickaxe, and a
    // throw through the gap. The arena's drill of 2026-10-06 (05:24 to
    // 05:49Z), full iron and 48 snowballs, took the four the arrows could
    // reach and then stood twenty minutes with the two caged crystals
    // healing the dragon, none good answered 347 times.
    const pick = bot.inventory.items().find(i => /_pickaxe$/.test(i.name) && !/wooden|golden/.test(i.name));
    if (safe && throwing && actions.dig && pick) {
      const here = bot.entity.position, carried = blocksCarried(bot);
      for (const target of crystals.filter(c => caged(bot, c))) {
        const out = Math.hypot(target.position.x - here.x, target.position.z - here.z), up = target.position.y - here.y;
        const lift = Math.max(0, Math.ceil(target.position.y + 0.5 - (here.y + 1.62)));
        if (out > 7 || up < -2 || lift > Math.min(carried, 40)) continue;
        tree[`open_cage_${target.id}`] = {
          description: { action: `Pillar up ${lift} blocks beside the caged crystal's pillar, dig out the iron bars between the bot and the crystal with the ${pick.name.replaceAll('_', ' ')}, and throw at it through the gap: iron bars stop a throw, so a caged crystal is reached only so`,
            position: { ...target.position }, blocks: lift, blocksCarried: carried, out: Math.round(out),
            fallFromTheTop: `a knock off the top is a fall of ${lift} blocks, about ${Math.max(0, lift - 3)} damage before armour${countOf(bot, 'water_bucket') ? ', a water bucket carried for the landing' : ''}`,
            crystalBlast: 'the crystal bursts when it breaks, close beside the bot at its height: the arena\'s drill of 2026-10-06 (05:46Z, full iron) took 11.8 from it there, and died on the pillar\'s top twenty-four seconds later, 6 a second, the dragon 70 to 90 blocks off; it took the caged crystal', thrownLeft: THROWABLE.reduce((n, k) => n + countOf(bot, k), 0), health: bot.health },
          run: async () => {
            if (lift) await require('./pillar-recovery').pillarUp(bot, task, Math.floor(bot.entity.position.y) + lift, { dig: actions.dig, maxBlocks: lift, threats: false });
            const eye = bot.entity.position.offset(0, 1.62, 0), mid = target.position.offset(0, 1, 0), dir = mid.minus(eye), len = dir.norm();
            const bars = [];
            for (let t = 0; t <= len; t += 0.2) { const c = eye.plus(dir.scaled(t / len)).floored(); if (bot.blockAt(c)?.name === 'iron_bars' && !bars.some(b => b.equals(c))) bars.push(c); }
            console.log(`[end combat] open cage: up ${lift}, ${bars.length} bar${bars.length === 1 ? '' : 's'} on the line`);
            for (const c of bars.slice(0, 4)) { check(); if (eye.distanceTo(c.offset(0.5, 0.5, 0.5)) > 4.8) break; await actions.dig(bot, task, c); }
            for (let n = 0; n < 3 && live(bot, target); n++) {
              check();
              if (!aimAtEntity(bot, target, new Vec3(0, 0, 0), bot.entity.position, THROWN)) { console.log('[end combat] open cage: no line yet'); break; }
              try { await throwCrystal(target, { fromPillar: true }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] open cage throw failed: ${String(err.message || err).slice(0, 160)}`); break; }
            }
          } };
      }
    }
    if (safe && bow && countOf(bot, 'arrow') > 0) {
      for (const target of crystals) if (!repeatedCrystalMiss(state, target, bot.entity.position) && aimAtEntity(bot, target)) tree[`crystal_${target.id}`] = {
        description: { action: 'Destroy an observed healing crystal with a clear bow trajectory, removing a source of dragon health regeneration', position: { ...target.position }, arrowsLeft: countOf(bot, 'arrow'), crystalsInView: crystals.length }, run: () => shoot(target),
      };
      if (dragon && !perched(bot, dragon)) {
        for (let n = 0; n < 6; n++) { check(); await sleep(50); }
        let motionNow; try { motionNow = velocity(); } catch (err) { noShot = err.message; /* no feasible predicted shot */ }
        const trajectory = motionNow && aimAtEntity(bot, dragon, motionNow);
        if (motionNow && !trajectory) noShot = `no clear arrow trajectory to it ${Math.round(dragon.position.distanceTo(bot.entity.position))} blocks off`;
        if (trajectory) tree.shoot_dragon = {
          description: { action: 'Shoot the currently arrow-vulnerable flying dragon along the checked clear trajectory',
            safeFiringPosition: true, flightSeconds: trajectory.ticks / 20, dragonHealth: beforeDragon, observedHealingCrystals: crystals.length, arrowsLeft: countOf(bot, 'arrow'),
            // The arrows against the crystals (note 1172): one loosed at the dragon is one fewer for a crystal, and a crystal standing heals back what the arrow took.
            ...(crystals.length ? { crystalsHealIt: `${crystals.length} healing crystal${crystals.length === 1 ? '' : 's'} in view still stand${crystals.length === 1 ? 's' : ''}: each heals the dragon while it flies near, only an arrow reaches one on its pillar, and ${countOf(bot, 'arrow')} arrow${countOf(bot, 'arrow') === 1 ? ' is' : 's are'} left` } : {}), ...(wet ? { fromItsWater: wetSays() } : {}) }, run: () => shoot(dragon),
        };
      }
    }
    const head = dragon && perchedHead(bot, dragon);
    // How long the dragon has sat (note 1405): it takes off after five
    // seconds to most of a minute, and the run under it is said with that.
    if (dragon && perched(bot, dragon)) state.perchedSince ||= Date.now(); else delete state.perchedSince;
    // For the sword at the perched head the place is judged by what is at
    // hand (note 1159): no mob within eight blocks, no breath or crystal
    // over it. The twenty blocks kept from a turned enderman are for a bow
    // drawn standing still; the rehearsal of 2026-10-04 (02:48:30Z) stood
    // under the head, "strike in reach, not offered", for an enderman
    // twenty blocks off.
    const strikeSafe = () => !endMobs(bot).some(e => live(bot, e) && e.position.distanceTo(bot.entity.position) < 8) &&
      endHazards(bot).every(({ entity, radius }) => hazardDistance(bot.entity.position, entity) > radius);
    const atHand = safe || strikeSafe();
    if (atHand && head && canStrike(bot, head) && bot.inventory.items().some(i => /_sword$/.test(i.name) && durable(bot.registry, i))) {
      const edge = voidEdge(bot, bot.entity.position);
      tree.strike_head = { description: `Strike the reachable head of the perched dragon with the carried sword, and keep striking for as long as it sits and the place stays safe, up to ten seconds${edge ? `: the void is ${edge} block${edge === 1 ? '' : 's'} from where the bot stands, and the dragon's wing throws a player` : ''}`, run: () => strikeWhilePerched(10000) };
    }
    // The perched head out of reach: straight to the ground under it and the
    // sword there for as long as it sits (note 1155). Three routes surveyed
    // a second each and one swing a question were the perch gone: the
    // rehearsal of 2026-10-04 (02:12 to 02:15Z), waiting by the fountain,
    // was 8 to 20 blocks from the head at each of six perches and never
    // under it.
    const swordCarried = bot.inventory.items().some(i => /_sword$/.test(i.name) && durable(bot.registry, i));
    if (atHand && head && !canStrike(bot, head) && swordCarried && head.position.distanceTo(bot.entity.position) <= 40) {
      let ground = null;
      for (let y = Math.floor(head.position.y); y >= Math.floor(head.position.y) - 8 && !ground; y--) {
        const p = new Vec3(Math.floor(head.position.x) + .5, y, Math.floor(head.position.z) + .5);
        if (dryStanding(bot, p)) ground = p;
      }
      // Within the sword's reach from the ground, or from two blocks laid under the feet.
      if (ground && head.position.y - ground.y <= (actions.dig ? 6.4 : 4.5)) tree.under_head = {
        description: { action: 'Run to the ground under the perched dragon\'s head and strike it with the sword for as long as it sits: the sword reaches the dragon only here, its breath pools on the ground before its head, and it takes off within seconds',
          headBlocksOff: Math.round(head.position.distanceTo(bot.entity.position)), headBlocksOverItsGround: Math.round((head.position.y - ground.y) * 10) / 10, dragonHealth: beforeDragon, health: bot.health,
          voidEdgeBlocks: voidEdge(bot, ground), endermenNearRoute: endermenNearRoute(bot, bot.entity.position, ground), headHitThroughArmourWorn: headHit(bot),
          perchedSeconds: Math.round((Date.now() - state.perchedSince) / 1000), runSeconds: Math.round(ground.distanceTo(bot.entity.position) / 5.6 * 10) / 10,
          // The perch's own rule (note 1537), from the game's code: sitting, the dragon looks for a player within twenty blocks of it (and within ten up or down); seeing one it stays, turns to it, and after a second and a quarter roars and breathes at it, four breaths and then off; seeing none for five seconds it takes off. Every run of 2026-10-13 began beyond twenty blocks, and the dragon, alone at its perch, left before the run arrived.
          perchRule: `the dragon stays at its perch only while a player stands within 20 blocks of it (and within 10 up or down): alone there five seconds, it takes off. It has sat ${Math.round((Date.now() - state.perchedSince) / 1000)} s; the bot is ${Math.round(Math.hypot(dragon.position.x - bot.entity.position.x, dragon.position.z - bot.entity.position.z))} blocks from it, ${Math.max(0, Math.round((Math.hypot(dragon.position.x - bot.entity.position.x, dragon.position.z - bot.entity.position.z) - 20) / 5.6 * 10) / 10)} s of running from the 20-block ring. Within the ring it turns to the bot and breathes at it every few seconds, the cloud on the ground before its head; after four breaths, or 50 damage taken while sitting, it takes off.`,
          takeoff: `it sits from about five seconds to most of a minute; as it takes off its body knocks what stands beside it high into the air, and ${countOf(bot, 'water_bucket') ? 'a water bucket is carried to land in' : 'no water bucket is carried to land in'}: the dragon stage of 2026-10-07 (25588) ran under it 18 seconds into a perch with none, arrived as it took off, was hit for 10 and thrown 56 blocks up, and died of the fall`,
          // This fight's record of the run (note 1510): 25588 (dragon-77, 2026-10-13 19:44 to 19:51Z) ran four times from 20 to 40 blocks, reached the head none, 'the dragon took off before the bot was under its head', and lost 6 to 7 health to a run twice.
          // The day's record (note 1526): the runs across the trials of 2026-10-13 (dragon-6 to dragon-86), none of them a strike, and the take-off's throw the end of three fights.
          todaysRecord: 'Of the runs under the perched head in the trials of 2026-10-13 (nine ended by the dragon taking off first, none reaching the head; each began 20 to 40 blocks out, beyond the 20 blocks at which the dragon sees a player and stays), none struck it; three fights ended within fifteen seconds of a run: dragon-70 (18:00Z, three blows of the dragon at the perch, 20 to 9, then the breath), dragon-77 (20:01Z, three blows in a second and a half, 20 to 9.4, the record run of nine crystals), dragon-86 (21:42Z, two blows and the take-off threw the body 44 blocks to its death).',
          thisFight: state.underHead?.tries ? `this fight's ${state.underHead.tries} run${state.underHead.tries === 1 ? '' : 's'} under the head: ${state.underHead.reached} reached it before it took off, ${state.underHead.struck} struck it, ${Math.round(state.underHead.lost * 10) / 10} health lost on the runs` : 'not run this fight yet',
          ...(drillSays(bot) ? { drill: drillSays(bot) } : {}) },
        run: async () => {
          const tally = state.underHead ||= { tries: 0, reached: 0, struck: 0, lost: 0 }; tally.tries++; const healthAtStart = bot.health;
          bot._underHeadRun = true; setTimeout(() => { bot._underHeadRun = false; }, 60000);
          const reached = () => { const h = live(bot, dragon) && perchedHead(bot, dragon); return !h || canStrike(bot, h); };
          try { await actions.navigate(bot, task, new goals.GoalNear(Math.floor(ground.x), ground.y, Math.floor(ground.z), 1), { timeoutMs: 9000, stallMs: 2500, sprint: true, stopWhen: () => reached() || hostileEntities(bot, 4).some(e => live(bot, e)) }); }
          catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency'].includes(err.name)) throw err; }
          let h = live(bot, dragon) && perchedHead(bot, dragon);
          tally.lost += Math.max(0, healthAtStart - bot.health); save();
          if (!h) throw new Error('The dragon took off before the bot was under its head');
          tally.reached++; save();
          // The last blocks closed on foot (note 1558): the walk ended within its
          // goal's radius but not under the head, and 25588 (dragon-108,
          // 2026-10-14 02:05Z, eight crystals broken, the fight's one run that
          // reached the dragon) stood 3.6 blocks from the head's box, 'out of
          // the sword's reach', and was flung by the take-off. Said with the
          // geometry either way.
          const gapTo = head => { const e = bot.entity.position.offset(0, 1.62, 0); return Math.round((Math.hypot(Math.max(0, Math.abs(head.position.x - e.x) - .5), Math.max(0, Math.abs(head.position.z - e.z) - .5))) * 10) / 10; };
          if (!canStrike(bot, h) && gapTo(h) > 1.2) {
            try {
              await require('./motion').move(bot, task, { label: 'under_head_close', keys: ['forward', 'sprint'], sneak: false, why: 'the last blocks to the ground under the perched head (note 1558)', look: h.position.offset(0, -2, 0), maxMs: 3000, tick: 25,
                until: () => { const hh = live(bot, dragon) && perchedHead(bot, dragon); return !hh || canStrike(bot, hh) || gapTo(hh) <= 1.0; } });
            } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
            h = live(bot, dragon) && perchedHead(bot, dragon);
            if (!h) throw new Error('The dragon took off before the bot was under its head');
          }
          console.log(`[end combat] under the head: the head modelled at ${h.position.floored()} (dragon at ${dragon.position.floored()}, yaw ${Math.round((dragon.yaw || 0) * 100) / 100}), the body at ${bot.entity.position.floored()}, ${gapTo(h)} aside and ${Math.round((h.position.y - (bot.entity.position.y + 1.62)) * 10) / 10} over the eyes, ${canStrike(bot, h) ? 'in reach' : 'out of reach'}`);
          // Under it and a block or two short of it: up on blocks laid under
          // the feet (note 1176). The head sits three to four blocks over
          // the ground by the fountain, and the sword reaches three from the
          // eyes. The rehearsals of 2026-10-04 (02:25 to 04:48Z) ended eight
          // runs under the head "out of the sword's reach".
          if (!canStrike(bot, h)) {
            const lift = Math.ceil(h.position.y - (bot.entity.position.y + 1.62) - 2.4);
            if (lift >= 1 && lift <= 2 && actions.dig) {
              try { await require('./pillar-recovery').pillarUp(bot, task, Math.floor(bot.entity.position.y) + lift, { dig: actions.dig, maxBlocks: lift, threats: false }); }
              catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency'].includes(err.name)) throw err; }
              h = live(bot, dragon) && perchedHead(bot, dragon);
              if (!h) throw new Error('The dragon took off before the bot was under its head');
            }
          }
          if (!canStrike(bot, h)) throw new Error('Under the perched head, and it is out of the sword\'s reach');
          try { await strikeWhilePerched(10000); } finally { bot._underHeadRun = false; }
          { const after = metadata(bot, dragon, 'health'); if (Number.isFinite(after) && after < beforeDragon) tally.struck++; save(); }
        } };
    }
    // A crystal broken by hand (note 1414): up a pillar of the blocks carried
    // beside the crystal's obsidian pillar, and the crystal struck from there
    // with whatever is in hand; any blow breaks one. Its blast is centred on
    // the top face of the bedrock it stands on, so every ray of the blast
    // that goes downward enters the bedrock: a bot wholly under that face is
    // out of the blast's line. Beside a thin pillar (radius two) the crystal
    // is in reach from two blocks under the top, and the bot stands there;
    // beside a thick one it is not, and the bot goes onto the top, two blocks
    // from the bedrock, crouched, its body above the face in the blast's
    // line (struck from beside it standing, the arena's drill of 2026-10-06
    // took 11.8 in full iron). Measured in the arena: PUNCH_RECORD. With no
    // bow, arrows or snowballs this is the one way to the crystals: 25595
    // (2026-10-13 23:08 to 23:28Z), three arrows against eight crystals, was
    // offered 462 moves and four shots in twenty minutes, answered 'none
    // good' two times in three, and died with the dragon unhurt. A caged
    // crystal is the pickaxe's (open_cage).
    // From its own pillar too, where the ground's mobs below make the place
    // 'unsafe' (the climb goes on, not down and up again), with no hazard on it.
    // The crystal's own twelve blocks (a hazard to a shot at it) are no bar
    // to the climb to strike it (note 1416): 25588 (dragon-6, 2026-10-13
    // 05:40Z), 22 up its column beside the crystal, was held 'unsafe: end
    // crystal 10<=12' at every tick, offered nothing, and died of the fall.
    // And from the obsidian top itself, where the blow is struck (note 1426):
    // 25588 (dragon-11, 2026-10-13 06:27Z), a cell short of its stand on the
    // top, was offered nothing there ('unsafe: end crystal 4<=12'), took the
    // dragon's wing twice and fell.
    const punchPlace = safe || ((onOwnPillar() || onObsidianTop()) && endHazards(bot).filter(({ entity }) => entity.name !== 'end_crystal').every(({ entity, radius }) => hazardDistance(bot.entity.position, entity) > radius));
    if (punchPlace && actions.dig && !Object.keys(tree).some(k => /^(throw_|pillar_throw_)/.test(k))) {
      const here = bot.entity.position, carried = blocksCarried(bot);
      // A caged crystal too, where a pickaxe is carried: its iron bars between
      // the stand and the crystal are dug out on the top before the blow.
      const pickForBars = bot.inventory.items().find(i => /_pickaxe$/.test(i.name) && !/wooden|golden/.test(i.name));
      // The three cheapest pillars, not the two nearest (note 1582): the climb's
      // cost is its lift and the walk, and the nearest pillar is often the
      // tallest. Of the 410 none_good tops on dragon_fight between 03 and 05Z
      // on 2026-10-14, 93 were on a tree of moves, observe and the quarry for
      // the nearest crystal alone, its climb gated by the blocks wanted, while
      // a pillar twenty blocks shorter stood forty blocks off, never offered.
      const climbCost = c => Math.max(0, c.position.y - 2 - Math.floor(here.y)) + Math.hypot(c.position.x - here.x, c.position.z - here.z) / 4;
      const byDistance = crystals.filter(c => (!caged(bot, c) || pickForBars) && bot.blockAt(c.position.floored().offset(0, -1, 0))?.name === 'bedrock')
        .sort((a, b) => climbCost(a) - climbCost(b)).slice(0, 3);
      for (const target of byDistance) {
        const c = target.position.floored(), topY = c.y - 1;
        // The pillar's radius, read along its side a few blocks under the top.
        let radius = 0; while (radius < 8 && bot.blockAt(new Vec3(c.x + radius + 1, c.y - 3, c.z))?.name === 'obsidian') radius++;
        const isCaged = caged(bot, target), under = radius <= 2 && !isCaged, feetY = under ? topY - 1 : topY;
        const out = Math.round(Math.hypot(c.x + .5 - here.x, c.z + .5 - here.z)), lift = feetY - Math.floor(here.y);
        // Three over the lift (note 1468): the roofs on the way are of the same blocks, and 25588 (dragon-48, 2026-10-13 13:12Z) climbed 22 for a lift of 23 and stopped a block short with none left.
        // The three over the lift only before the climb (note 1470): on the column already, the climb finishes with what is carried. 25588 (dragon-52, 2026-10-13 13:53Z) at crystal 98's top, lift 28 and 30 blocks, was offered no blow, held 30 seconds 'unsafe: end_crystal 4<=12', and the breath took it 20 to none.
        // The roofs counted in (note 1541): one block every third block of the climb against the obsidian, and 25588 (dragon-95, 2026-10-13 23:53Z) began crystal 94's climb of 31 with 27 blocks and stood at 72 with 18 and 22 to go, no blow offered, and dug down.
        const roofs = Math.ceil(Math.max(0, lift) / 3);
        const margin = (onOwnPillar() || onObsidianTop()) ? 0 : 3 + roofs;
        // A lift of none is a stand reached (note 1472): 25588 (dragon-54, 2026-10-13 14:13Z) stood at crystal 66's stand, 'no blow at crystal 66: 3 off, lift 0', held 'unsafe' twenty seconds and died in the breath; dragon-52 the same at 98.
        if (out > 64 || lift < 0 || lift + margin > Math.min(carried, 64 + margin)) {
          if (!(state.punchSkipSaid > Date.now() - 20000)) { state.punchSkipSaid = Date.now(); console.log(`[end combat] no blow at crystal ${target.id}: ${out} off, lift ${lift}, ${carried} blocks carried, radius ${radius}`); }
          // Too few blocks for the climb, a pickaxe carried and the island's
          // stone underfoot (note 1435): the blocks are dug here, Jev's to
          // choose. 25588 (dragon-19, 2026-10-13 07:53Z, full iron, an iron
          // pickaxe, 28 cobblestone) was offered a walk and a look at every
          // tick, 'no blow at crystal 13: lift 33, 28 blocks carried', the
          // island's end stone under its feet the whole while.
          const floorHere = bot.blockAt(here.floored().offset(0, -1, 0))?.name;
          // The quarry's gate is the climb's budget (note 1565): the climb wants lift + roofs + 3, and 25588 (dragon-114, 2026-10-14 03:25Z, five crystals broken) stood with 52 blocks, crystal 73's climb wanting 58, the quarry only offered under 47, 'only observe'.
          if (out <= 64 && lift >= 1 && lift <= 64 && lift + roofs + 3 > carried && pickForBars && floorHere === 'end_stone' && !onOwnPillar() && !Object.keys(tree).some(k => k.startsWith('quarry_blocks_'))) {
            // Ten over the lift (note 1464): the roofs on the way up and down are
            // of the same blocks, and 25588 (dragon-43, 2026-10-13 12:23Z, three
            // crystals broken) climbed 38 for a lift of 37 and stopped a block
            // short with none left, 'no block of the kinds the climb lays carried'.
            const want = Math.min(24, lift + roofs + 7 - carried);
            const { deepBeside } = require('./end-safety');
            const feet = here.floored();
            const cells = [];
            // Two cells out and never below the feet (note 1461): dug at the
            // feet, each round left the bot a block lower in its own pit and
            // the climb a block taller, and the stone rolled down the slope.
            // 25588 (dragon-41, 2026-10-13 12:01Z, full iron) quarried at
            // crystal 11's foot from lift 33 to lift 48 with 40 blocks carried,
            // worked its way down the eastern slope to y 29 and went over the
            // rim. The stone dug is level with the feet or a block up.
            // Level with the feet or a block up, as the note above says, and
            // under the open sky (note 1487): the code dug the floor round the
            // feet (a block down) and the walls beside them, and each round left
            // the bot a block lower in a pit of its own, the next round digging
            // from the pit's floor. 25588 (dragon-66, 2026-10-13 16:30Z) quarried
            // 65 cells in three rounds at (41 to 51, 42 to 46, 3 to 6), dug
            // itself four blocks under the island's top and a tunnel west along
            // z 6 at 42 under solid rock, and could walk to no pillar's foot:
            // 'not reached' from 52 and 35 blocks, the pathfinder digging nothing.
            // Under the sky: no block within twelve over the cell, so no tunnel.
            const skyOver = p => { for (let dy = 1; dy <= 12; dy++) if (bot.blockAt(p.offset(0, dy, 0))?.boundingBox === 'block') return false; return true; };
            // The floor a block down as well, but only from level ground (note
            // 1494): standing in a pit (a block beside the feet at their level)
            // the walls are dug, never the floor, so no pit goes two deep. On the
            // island's flat middle nothing rises beside the feet, and 25588
            // (dragon-68, 2026-10-13 17:20Z, three crystals broken, 10 blocks
            // carried, 26 wanted) stood 'only observe' with no quarry offered.
            // Any block at the feet's level within four, not only beside them
            // (note 1503): the rounds dig a ring to four out, and standing in
            // the middle of a pit seven wide nothing is beside the feet, so the
            // floor went down again. 25588 (dragon-74, 2026-10-13 19:09Z) stood
            // at (9, 55, 10), six under the island's top, 'only observe',
            // crystal 77's climb grown from 17 blocks to 24.
            const byWater = p => [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]].some(([ax, ay, az]) => /water/.test(bot.blockAt(p.offset(ax, ay, az))?.name || ''));
            let inPit = false;
            for (let dx = -4; dx <= 4 && !inPit; dx++) for (let dz = -4; dz <= 4 && !inPit; dz++) if ((dx || dz) && bot.blockAt(feet.offset(dx, 0, dz))?.boundingBox === 'block') inPit = true;
            // Out to seven (note 1547), not four: in the pits the earlier quarries left, the ring two to four out is air at the feet's level, and 25588 (dragon-97, 2026-10-14 00:32Z, four crystals broken, 32 blocks, 21 wanted) stood at (7, 60, 17) 'only observe', 'quarry cells 2'.
            if (skyOver(feet.offset(0, -1, 0))) for (let r = 2; r <= 7 && cells.length < want; r++) for (let dx = -r; dx <= r && cells.length < want; dx++) for (let dz = -r; dz <= r && cells.length < want; dz++) {
              if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
              for (const dy of inPit ? [1, 0] : [1, 0, -1]) {
                const p = feet.offset(dx, dy, dz);
                if (bot.blockAt(p)?.name !== 'end_stone' || bot.blockAt(p.offset(0, -1, 0))?.boundingBox !== 'block' || !skyOver(p) || deepBeside(bot, p.offset(.5, 1, .5))) continue;
                // Not beside water, nor within two of the pool poured for a drop
                // (note 1534): the water runs into the cell dug and the pool is
                // not taken back. 25588 (dragon-92, 2026-10-13 23:14Z, four
                // crystals broken) landed its 39-block drop in the pool at (11,
                // 58, 34), quarried eleven cells round (10, 56, 35) beside it,
                // never took the pool back, and poured its next with '0 full
                // buckets left'.
                if (byWater(p) || (state.pool && Math.max(Math.abs(p.x - state.pool.x), Math.abs(p.z - state.pool.z)) <= 2)) continue;
                cells.push(p); break;
              }
            }
            state.quarryLook = { crystal: target.id, cells: cells.length, want, inPit, sky: skyOver(feet.offset(0, -1, 0)), at: Date.now() }; state.quarryCells = cells.map(c => ({ x: c.x, y: c.y, z: c.z }));
            if (cells.length >= Math.min(want, 4)) tree[`quarry_blocks_${target.id}`] = {
              description: { action: `Dig ${cells.length} end stone from the island's ground within seven blocks of where the bot stands, with the ${pickForBars.name.replace('_', ' ')}, for the climb beside crystal ${target.id}'s pillar: ${lift} blocks up to its stand, ${carried} carried. The floor cells dug have rock under them and no void beside; the dragon's passes and breath go on while it digs (about a second a block). The crystal is ${out} blocks off.`,
                blocksWanted: lift, blocksCarried: carried, cellsToDig: cells.length, health: bot.health, dragonBlocksOff: dragon ? Math.round(dragon.position.distanceTo(here)) : null },
              run: async () => {
                const before = blocksCarried(bot);
                goal.step = { action: 'quarry_blocks', crystal: target.id, cells: cells.length }; save();
                let dug = 0, skipped = 0, hostile = null;
                // The quarry stops for a hostile within five (note 1525): the step's emergencies are the dragon's and the breath's, not an enderman's, and 25588 (dragon-85, 2026-10-13 21:34Z, three crystals broken, a diamond sword and a shield carried) went on digging through five blows of an enderman in four seconds, 20 to none.
                const hostileNear = () => (hostile = hostileEntities(bot, 5).find(e => live(bot, e) && e.name !== 'ender_dragon') || null);
                for (const p of cells) {
                  check();
                  if (hostileNear()) { console.log(`[end combat] the quarry stopped for a ${hostile.name} ${Math.round(hostile.position.distanceTo(bot.entity.position))} blocks off`); break; }
                  if (inWater() || (bot.oxygenLevel ?? 20) < 18) { console.log(`[end combat] the quarry stopped: the body in the water at ${bot.entity.position.floored()}, breath ${bot.oxygenLevel}`); break; }
                  if (bot.blockAt(p)?.name !== 'end_stone') { skipped++; continue; }
                  try { await actions.dig(bot, task, p, { requireDrops: false }); dug++; } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; console.log(`[end combat] quarry stopped at ${p}: ${String(err.message || err).slice(0, 120)}`); break; }
                }
                // The stone picked up from where it lies, twelve blocks about and
                // ten seconds (note 1449): dug on the island's slopes it rolls, and
                // 25588 (dragon-30, 2026-10-13 09:52Z) quarried twice for nothing
                // gained, 35 end stone lying eight to ten blocks off at (36 to 38,
                // 42, -7 to -11), two blocks up the slope from where it stood.
                // Every stone, not the first (note 1502): collectNearbyDrops returns at
                // the first item gained, and 25588 (dragon-74, 2026-10-13 18:57Z) dug 18
                // cells and 'quarried 1', six stones lying two and three blocks off,
                // then dug 24 more for 2. Picked up until none is gained or twenty seconds.
                { const t0 = Date.now(); let rounds = 0;
                  while (Date.now() - t0 < 20000 && rounds < 30 && !hostileNear()) {
                    check(); rounds++;
                    let got = false;
                    try { got = await require('./drop-collection').collectNearbyDrops(bot, task, 'end_stone', { radius: 8, timeoutMs: 5000, waitForSpawnMs: rounds === 1 ? 300 : 0, move: actions.navigate }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; break; }
                    if (!got) break;
                  } }
                const after = blocksCarried(bot);
                // What the quarry came to, said (note 1479): 25588 (dragon-61, 2026-10-13 15:27Z) 'quarried 0' on the eastern slope at (70, 45, -12) with no word of the cells dug or where the stone lay.
                const lying = Object.values(bot.entities).filter(e => e.name === 'item' && e.isValid !== false && e.position && e.position.distanceTo(bot.entity.position) <= 16).map(e => `${e.position.floored()} ${Math.round(e.position.distanceTo(bot.entity.position))} off`);
                console.log(`[end combat] quarried ${after - before} end stone for the climb (${after} blocks carried, ${lift} wanted for crystal ${target.id}; ${dug} of ${cells.length} cells dug, ${skipped} no longer end stone; items lying within 16: ${lying.length ? lying.slice(0, 6).join(', ') : 'none'})`);
                if (after > before) progress = true;
                save();
              } };
          }
          continue;
        }
        // Up its own pillar beside another crystal's, the way to this one's foot
        // is down first (pillar_down): the arena's drill of 2026-10-13 (03:45Z)
        // tried the walk from the top four times, 24 to 28 blocks off.
        if ((onOwnPillar() || onObsidianTop() || here.y > 72) && out > radius + 2.2) continue;
        // A foot the walk did not reach rests two minutes (note 1424): from the
        // entry platform, 25588 (dragon-11, 2026-10-13 06:33Z) was offered the
        // crystal 63 blocks off across the void and chose it, the walk going
        // nowhere, while the bridge to the island was the way.
        if ((state.punchUnreached || {})[target.id] > Date.now() - 120000) continue;
        tree[`pillar_punch_${target.id}`] = {
          description: { action: under
            ? `Walk to the foot of the healing crystal's obsidian pillar (radius ${radius}), pillar up ${lift} blocks beside it on the blocks carried to two under the bedrock the crystal stands on, and strike the crystal from there by hand: any blow breaks one, and the bedrock is between the bot and its blast`
            : `Walk to the foot of the healing crystal's obsidian pillar (radius ${radius}, too thick to reach the crystal from its side), pillar up ${lift} blocks beside it on the blocks carried to its top, step onto the top two blocks from the crystal's bedrock, crouch, and strike the crystal by hand: any blow breaks one; crouched, the bot's body above the bedrock's top face is in the blast's line`,
            position: { ...target.position }, blocksOff: out, blocks: lift, blocksForTheClimb: lift + roofs, blocksCarried: carried, pillarRadius: radius, stance: under ? 'under the bedrock top, beside the pillar' : 'on the top, crouched',
            dragonBlocksOff: dragon ? Math.round(dragon.position.distanceTo(here)) : null,
            // Whether the drop's pool can be poured at this pillar's foot (note 1539): at the island's eastern rim (pillars 9, 11 and 20 of this world) no level cell beside the foot is clear of the void, the way down is the bucket in the air alone, and 25588 died on it three times on 2026-10-13 (dragon-84, 90, 93) and landed twice (dragon-92, 94).
            // With no water carried the pool is not poured (note 1572): 25588 (dragon-120, 2026-10-14 04:05Z) climbed crystal 88's pillar told 'a pool of water can be poured', both buckets empty, the water left at (-36, 61, 19), 26 blocks off, and dug down 18 after the blow.
            wayDown: poolAtTheFoot(c, radius, lift) ? (countOf(bot, 'water_bucket') ? 'a pool of water can be poured on level ground beside this pillar\'s foot before the climb, and the drop after the blow lands in it' : `no water is carried to pour the pool at this pillar\'s foot: ${waterLeftSays()}the way down from its top is the column dug a block at a time`) : 'no pool can be poured at this pillar\'s foot: the void lies within eight blocks of every level cell beside it. The way down from here is the column dug down to a height the health can take and the bucket clicked under the body in the last blocks of the fall, a click the server refuses about one time in three; of the five such drops of 2026-10-13 at this rim, three ended in death (dragon-84, 90, 93) and two landed',
            onTheColumn: `the climb and the way down are a minute or two each on a column one block wide, where the dragon's fireballs and breath find the bot and there is no step aside; the dragon's charge is its body, and it carried 25588 off its column at 71, 30 blocks to y 87 and onto the rim, dead (dragon-112, 2026-10-14 02:39Z): with the pool below, a charge is met by the drop into it: a fireball's cloud on the column took 6 a second from 25588 (2026-10-13 06:05Z, 20 to 8 in six seconds, and 10 to none a minute later on its next climb); in the arena's drills (05:08 to 05:35Z) the bot broke six crystals so and died twice on its column after a blow; the breath or a fireball on the column is answered by digging down three`, ...(isCaged ? { caged: `iron bars round it, dug out between the stand and the crystal with the ${pickForBars.name.replaceAll('_', ' ')} first` } : {}), dragonPhase: metadata(bot, dragon, 'phase'), health: bot.health,
            fallFromTheTop: `a knock off the top is a fall of ${lift} blocks, about ${Math.max(0, lift - 3)} damage before armour${countOf(bot, 'water_bucket') ? ', a water bucket carried for the landing' : ', no water bucket carried'}`,
            crystalBlast: punchRecordSays(state, under),
            // The health against the breath, in numbers (note 1511): 25588 (dragon-77, 2026-10-13 20:01Z, nine crystals broken, the record) chose this climb at 9.2 health and again at 4.8, and the breath on the column took the rest.
            healthForTheClimb: bot.health < 12 ? `${bot.health.toFixed(1)} health of 20: the breath on the column is 6 a second whatever is worn, so ${Math.ceil(bot.health / 6)} second${Math.ceil(bot.health / 6) === 1 ? '' : 's'} of it kill${Math.ceil(bot.health / 6) === 1 ? 's' : ''}; standing still with hunger 18 or more, health comes back about a point a second with food in the body, a point every four seconds without, so 20 is ${Math.ceil(20 - bot.health)} to ${Math.ceil((20 - bot.health) * 4)} seconds away` : undefined,
            // The shield's state (note 1491): the blast from the top is taken on the
            // shield, and a shield wears out (336 uses, a blocked blow costing its
            // damage). 25588 (dragon-67, 2026-10-13 16:52Z, four crystals broken)
            // had its shield break on a dragon's blow at 16:52, struck crystal 107
            // from the top without it at 16:56 and took 15.4, 20 to 5.6, and died.
            shield: (() => { const sh = bot.inventory.slots?.[45]?.name === 'shield' ? bot.inventory.slots[45] : bot.inventory.items().find(i => i.name === 'shield'); if (!sh) return `no shield carried: the blast from the top is taken bare, 15.4 health on 25588 (dragon-67, 2026-10-13 16:56Z, full iron)${under ? '; from two under the bedrock the blast is mostly stopped by the bedrock itself' : ''}`; const left = Math.max(0, 336 - (sh.durabilityUsed || 0)); return `a shield carried with ${left} of 336 uses left (a blocked blow costs its damage in uses); it breaks when they are spent, and the next blast from the top is taken bare, about 15 health`; })(),
            thisFightOnColumns: state.columnDamage?.hits ? `on this fight's columns the bot has taken ${state.columnDamage.total} health in ${state.columnDamage.hits} blow${state.columnDamage.hits === 1 ? '' : 's'} (the largest ${state.columnDamage.max}); it has ${Math.round(bot.health * 10) / 10} now, and a blow on the column cannot be stepped from` : 'no blow has been taken on a column this fight yet' },
          run: async () => {
            // The foot at whatever height the island has there (note 1447): the
            // island's ground runs from 36 to 60, and a goal at the bot's own
            // height was a point in the air or in the rock by the far pillars.
            // 25588 (dragon-28, 2026-10-13 09:35Z, crystal 10 broken, full
            // health) was 'not reached: 44 blocks from its middle' after forty
            // seconds and bounced between cells six blocks apart.
            const foot = new goals.GoalNearXZ(c.x + .5, c.z + .5, radius + 1);
            const walkFrom = bot.entity.position.floored(), walkAt = Date.now();
            try { await actions.navigate(bot, task, foot, { timeoutMs: 40000, stallMs: 6000, sprint: true, stopWhen: () => hostileEntities(bot, 4).some(e => live(bot, e)) }); }
            catch (err) {
              if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err;
              // Said (note 1486): the walk to a foot failed from 18, 19 and 52 blocks (25588, dragon-61, 64 and 66, 2026-10-13) with no word of why.
              console.log(`[end combat] the walk to crystal ${target.id}'s foot from ${walkFrom} ended after ${Math.round((Date.now() - walkAt) / 1000)} s at ${bot.entity.position.floored()}: ${String(err.message || err).slice(0, 160)}`);
            }
            // Up against the obsidian (note 1541): the column is raised where the
            // body stands, and a body a cell or two short of the pillar's side
            // raises a column whose top is a gap from the stand, and whose roofs
            // want posts (four blocks each) for want of a block beside. 25588
            // (dragon-95, 2026-10-13 23:51Z, crystal 12 broken) raised its column
            // at (-9, -37) for crystal 91 at (-13, -40), 'the stand on the
            // pillar's top was not reached: 4.4 from the bedrock' twice, and dug
            // 24 down for nothing; its next climb spent 20 blocks on 9 of lift.
            const obsidianBeside = () => { const f0 = bot.entity.position.floored(); return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => [0, 1].some(dy => bot.blockAt(f0.offset(dx, dy, dz))?.name === 'obsidian')); };
            if (!obsidianBeside() && Math.hypot(c.x + .5 - bot.entity.position.x, c.z + .5 - bot.entity.position.z) <= radius + 4) {
              try {
                await require('./motion').move(bot, task, { label: 'up_to_the_pillar', keys: ['forward'], sneak: false, why: 'the last step up against the pillar\'s obsidian, where the column goes up (note 1541)', look: new Vec3(c.x + .5, bot.entity.position.y + 1.2, c.z + .5), maxMs: 2500, tick: 25, until: () => obsidianBeside() });
              } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
              console.log(`[end combat] the last step to crystal ${target.id}'s pillar: ${obsidianBeside() ? 'the obsidian beside the feet' : 'still off it'} at ${bot.entity.position.floored()}, ${Math.round(Math.hypot(c.x + .5 - bot.entity.position.x, c.z + .5 - bot.entity.position.z) * 10) / 10} from its middle`);
            }
            const p = bot.entity.position, flat = Math.hypot(c.x + .5 - p.x, c.z + .5 - p.z);
            if (flat > radius + 2.2) { (state.punchUnreached ||= {})[target.id] = Date.now(); save(); throw new Error(`The pillar's foot was not reached: ${Math.round(flat)} blocks from its middle, its radius ${radius}`); }
            const from = Math.floor(p.y);
            await descentChoice(feetY - from);
            const footCell = bot.entity.position.floored();
            if (state.descent?.pick === 'water_drop') { try { await poolForTheDrop(footCell, feetY - from); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; } }
            // Back onto the foot cell before the climb (note 1548): the trench and
            // the pour walk the body up to five cells out along the row, and the
            // column rises where the body stands. 25588 (dragon-97, 2026-10-14
            // 00:36Z, four crystals broken) had the obsidian beside its feet at
            // (-32, 61, -21), dug its trench out to (-32, -16), and raised its
            // column at (-29, -27): 'the stand on the pillar's top was not
            // reached: 5.7 from the bedrock'.
            if (Math.hypot(footCell.x + .5 - bot.entity.position.x, footCell.z + .5 - bot.entity.position.z) > 0.8) {
              try { await actions.navigate(bot, task, new goals.GoalBlock(footCell.x, footCell.y, footCell.z), { timeoutMs: 8000, stallMs: 3000 }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
              console.log(`[end combat] back to the foot cell ${footCell} for the climb: ${Math.round(Math.hypot(footCell.x + .5 - bot.entity.position.x, footCell.z + .5 - bot.entity.position.z) * 10) / 10} off${obsidianBeside() ? ', the obsidian beside the feet' : ''}`);
            }
            // A climb stops at one block the server refused (pillarUp); taken up
            // again, three times at most, before it is given up.
            for (let tries = 0; tries < 3 && Math.floor(bot.entity.position.y) < feetY; tries++) {
              check();
              // A caged crystal's bars reach out over the climb's cells at the top
              // (note 1419): dug through where a pickaxe is carried. 25588
              // (dragon-8, 2026-10-13 06:05Z) stopped 2 short, 'iron bars over
              // the head, which the climb does not dig', three times.
              const pr = require('./pillar-recovery');
              const canDig = b => !!b && ((pr.DIGGABLE_ABOVE.test(b.name) && b.diggable) || (isCaged && !!pickForBars && b.name === 'iron_bars'));
              await pr.pillarUp(bot, task, feetY, { dig: actions.dig, maxBlocks: Math.max(1, feetY - Math.floor(bot.entity.position.y)), threats: false, canDig });
            }
            if (Math.floor(bot.entity.position.y) < feetY) throw new Error(`The pillar stopped ${feetY - Math.floor(bot.entity.position.y)} blocks short, ${Math.floor(bot.entity.position.y) - from} up`);
            if (!live(bot, target)) throw new Error('The crystal was gone before the blow');
            let aim = target.position.offset(0, .4, 0);
            if (!under) {
              // Onto the top and to two blocks from the bedrock at a crouch (no walk
              // off an edge): the pathfinder's goal on a pillar's top was not reached
              // (the arena's drill of 2026-10-13, 03:40Z).
              const q = bot.entity.position, dx = q.x - (c.x + .5), dz = q.z - (c.z + .5);
              const dir = Math.abs(dx) >= Math.abs(dz) ? new Vec3(Math.sign(dx) || 1, 0, 0) : new Vec3(0, 0, Math.sign(dz) || 1);
              const stand = c.offset(dir.x * 2, -1, dir.z * 2), centre = stand.offset(.5, 0, .5), flatTo = () => Math.hypot(centre.x - bot.entity.position.x, centre.z - bot.entity.position.z);
              if (typeof bot.lookAt === 'function') await bot.lookAt(centre.offset(0, 1.6, 0), true);
              await require('./motion').move(bot, { check, get cancelled() { return task.cancelled; }, label: task.label }, { label: 'pillar_top_stand', keys: ['forward'], sneak: true,
                why: 'onto the pillar\'s top, to two blocks from the crystal\'s bedrock', look: centre.offset(0, 1.6, 0), maxMs: 8000, tick: 50, until: () => flatTo() < 0.35 || Math.floor(bot.entity.position.y) < topY - 1 });
              // A cell short of the stand is still a stand, the crystal in reach
              // (note 1425): 25588 (dragon-11, 2026-10-13 06:36Z) stopped one cell
              // from it, three from the bedrock, and the blow was called off.
              const toBedrock = Math.hypot(c.x + .5 - bot.entity.position.x, c.z + .5 - bot.entity.position.z);
              if ((flatTo() > 0.7 && toBedrock > 3.4) || Math.floor(bot.entity.position.y) < topY - 1) throw new Error(`The stand on the pillar's top was not reached: at ${bot.entity.position.floored()}, wanted ${stand}, ${Math.round(toBedrock * 10) / 10} from the bedrock`);
              // The cage's bars between the stand and the crystal, dug out (the cell
              // next to the bedrock, from the top up three).
              if (isCaged) {
                const gap = c.offset(dir.x, -1, dir.z);
                for (let dy = 0; dy <= 2; dy++) { const cell = gap.offset(0, dy, 0); check(); if (/iron_bars/.test(bot.blockAt(cell)?.name || '')) await actions.dig(bot, task, cell, { requireDrops: false }); }
                if ([0, 1, 2].some(dy => /iron_bars/.test(bot.blockAt(gap.offset(0, dy, 0))?.name || ''))) throw new Error('The cage\'s bars between the stand and the crystal did not come out');
              }
              bot.setControlState?.('sneak', true);
              // A roof over the stand on the top (note 1451), on a post of three
              // laid on the side away from the crystal: the blow brings the
              // dragon, its fireball bursts on the roof and the cloud lies three
              // over the feet. 25588 (dragon-32, 2026-10-13 10:25Z, full iron,
              // crystals 109 and 110 broken) was in the breath on the top the
              // moment of the blow, 20 to 4.6, and the way back to its column
              // found no route; the next tick took the rest.
              try {
                const f0 = bot.entity.position.floored(), post = f0.offset(dir.x, 0, dir.z);
                const name = blocksCarriedName(bot), item = name && bot.inventory.items().find(i => i.name === name);
                if (item && bot.blockAt(post.offset(0, -1, 0))?.boundingBox === 'block') {
                  for (let dy = 0; dy <= 2; dy++) {
                    const cell = post.offset(0, dy, 0); if (bot.blockAt(cell)?.boundingBox === 'block') continue;
                    const ref = bot.blockAt(cell.offset(0, -1, 0)); if (ref?.boundingBox !== 'block') break;
                    check(); await bot.equip(item, 'hand'); await bot.lookAt(ref.position.offset(.5, 1, .5), true); await bot.placeBlock(ref, new Vec3(0, 1, 0)); await sleep(60);
                  }
                  const roofed = await roofOverhead();
                  console.log(`[end combat] a roof over the stand on the top at ${f0.offset(0, 2, 0)}: ${roofed ? 'laid' : 'not laid'}`);
                }
              } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
              aim = target.position.offset(0, 1.2, 0);
            }
            const before = bot.health;
            const sword = bot.inventory.items().find(i => /_sword$|_axe$/.test(i.name));
            if (sword) await bot.equip(sword, 'hand');
            // The shield up for the blow where one is carried: a raised shield
            // takes a blast from in front (a creeper's, TNT's), and the crystal's
            // comes from where the bot looks.
            let shielded = false;
            const worn = bot.inventory.slots?.[45]?.name === 'shield', shield = worn ? bot.inventory.slots[45] : bot.inventory.items().find(i => i.name === 'shield');
            if (shield) { try { if (!worn) await bot.equip(shield, 'off-hand'); bot.activateItem?.(true); shielded = true; await sleep(350); } catch (_) { shielded = false; } }
            check();
            if (typeof bot.lookAt === 'function') await bot.lookAt(aim, true);
            // The facing given a moment to land (note 1465): the shield stops a
            // blast from in front, and four blows today took 15.4 'no blast
            // seen', the unshielded figure, all at the pillar at (-10, -37)
            // (dragon-32, 37, 43, 44), the turn to the crystal and the blow in
            // the same tick.
            await sleep(250); check();
            let explosion = false;
            const observe = packet => { if (vector(packet.center).distanceTo(target.position) < 3) explosion = true; };
            bot._client.on('explosion', observe);
            try {
              // One blow (note 1463): a second at a crystal the server has removed is a blow at nothing it knows.
              for (let n = 0; n < 1 && !explosion && live(bot, target); n++) {
                bot._crystalBlow = true; try { bot.attack(target); } finally { bot._crystalBlow = false; }
                for (let k = 0; k < 40 && !explosion && live(bot, target); k++) { check(); await sleep(50); }
              }
            } finally { bot._client.removeListener('explosion', observe); bot.setControlState?.('sneak', false); if (shielded) { try { bot.deactivateItem?.(); } catch (_) { /* lowered already */ } } }
            await sleep(300);
            const took = Math.max(0, Math.round((before - bot.health) * 10) / 10);
            (state.punches ||= []).push({ at: Date.now(), id: target.id, took, exploded: explosion, gone: !live(bot, target), under, shielded });
            console.log(`[end combat] crystal ${target.id} struck ${under ? 'from under the bedrock top' : 'from the top, crouched'}${shielded ? ', shield up' : ''}: ${explosion ? 'it blew' : 'no blast seen'}${live(bot, target) ? ', it stands' : ', it is gone'}; the blast took ${took}`);
            // Gone after the blow is destroyed, the blast's packet seen or not
            // (note 1429): 25588 (dragon-13, 2026-10-13 06:55Z) broke crystal 2,
            // 'no blast seen, it is gone', and the fight kept it as standing.
            if (!live(bot, target)) {
              const evidence = { at: Date.now(), id: target.id, position: { ...target.position }, source: explosion ? 'explosion_and_entity_removed' : 'entity_removed_after_blow', by: 'hand' };
              state.destroyedCrystals.push(evidence); bot.emit('end_combat', { crystal: evidence }); progress = true;
              if (state.knownCrystals?.[crystalKey(target)]) Object.assign(state.knownCrystals[crystalKey(target)], { status: 'destroyed', confirmedAt: evidence.at });
            }
            // Back onto the bot's own column at a crouch (the way down is dug from
            // it, pillar_down): left on the obsidian top the bot had no way down
            // and reached for the next crystal's foot from 28 blocks up (the
            // arena's drill of 2026-10-13, 03:50Z).
            if (!under && bot._pillarUp && !await backToColumn()) console.log('[end combat] left on the pillar\'s top after the blow: the way down is pillar_top_down');
            // And three down the column at once (note 1444): the blow brings
            // the dragon, and the top is where its breath lands. 25588
            // (dragon-25, 2026-10-13 09:04Z) stood on the top after the blow
            // for the next question, the breath found it there, 20 to 3.9 on
            // the way down, and it fell. The crystal is gone; nothing is up
            // here.
            // All the way down (note 1459): the crystal is gone, and every stand
            // for a question on the column is a pass or a breath taken. 25588
            // (dragon-39, 2026-10-13 11:41Z, full iron, crystal 9 broken) came
            // down three at a time, 79, 75, 72, a question between each, and died
            // on the column at 72 with 7 blocks left.
            if (!live(bot, target) && (onOwnPillar() || onColumnCell())) { goal.step = { action: 'down_after_the_blow', crystal: target.id, health: bot.health }; save(); await wayDown({ limit: 64 }); }
            // And straight down the column (as pillar_down digs): left on the top at
            // 5.4 health, the drill of 2026-10-13 (04:02Z) took the dragon's breath
            // twice there, 6 and 6, and went over the edge at 1.5.
            // By the way down chosen, the drop first where it was (note 1573), not the dig alone.
            if (onColumnCell() && Math.floor(bot.entity.position.y) > 66) await wayDown({ limit: 64 });
            save();
          } };
      }
    }
    // A bed beside the perched head (bed-bomb.js): the heaviest blow, from a
    // trench that keeps the blast off the bot.
    const { bedPlans, bedBomb, bedsCarried } = require('./bed-bomb');
    if (safe && head && actions.dig && bedsCarried(bot) > 0 && bot.health >= 14) {
      // The line it can walk to, surveyed as a move is: the rehearsal of
      // 2026-10-03 (23:54:40 to 23:55:24Z) chose the bed 55 times in 44
      // seconds at a line with no route from where it stood ("No route from
      // here", each within a second), the dragon perched the while, and
      // spent the fight's budget on it (note 1136).
      let plan = null;
      for (const p of bedPlans(bot, head.position).filter(p => p.walk <= 12).slice(0, 4)) {
        check();
        const here = bot.entity.position.floored();
        if (here.x === p.stand.x && here.y === p.stand.y && here.z === p.stand.z) { plan = p; break; }
        const route = await surveyRoute(bot, task, bot.pathfinder.movements, new goals.GoalBlock(p.stand.x, p.stand.y, p.stand.z), 400);
        if (route.status === 'success') { plan = p; break; }
      }
      if (plan) tree.bed_bomb = {
        description: { action: 'Lay a bed beside the perched dragon\'s head and blow it from a trench one block deep: the heaviest blow available, about five health to the bot', bedsCarried: bedsCarried(bot), walk: Number(plan.walk.toFixed(1)) },
        run: async () => {
          const exploded = await bedBomb(bot, task, plan, { navigate: actions.navigate, dig: actions.dig, stillPerched: () => live(bot, dragon) && perched(bot, dragon) });
          (state.beds ||= []).push({ at: new Date().toISOString(), exploded, dragonHealth: metadata(bot, dragon, 'health') ?? null, health: bot.health }); save();
        } };
    }
    const unresolved = Object.values(state.knownCrystals).filter(e => e.status === 'unresolved');
    const remembered = unresolved.sort((a, b) => vector(a.position).distanceTo(bot.entity.position) - vector(b.position).distanceTo(bot.entity.position))[0];
    // With every crystal down and few arrows left, the place to be while the
    // dragon flies is by the fountain it perches on: the sword reaches its
    // head only there, and at its perch arrows do nothing (note 1155). The
    // rehearsal of 2026-10-04 (02:00 to 02:09Z, 48 arrows) stood 34 to 46
    // blocks from the head at four of its five perches, at the bow's range
    // from the dragon in flight, and the strike was never in reach.
    const centre = state.arenaCenter ? vector(state.arenaCenter) : new Vec3(0, bot.entity.position.y, 0);
    const arrowsLeft = countOf(bot, 'arrow');
    const byFountain = Math.hypot(bot.entity.position.x - centre.x, bot.entity.position.z - centre.z);
    // And with no arrow left at all, crystals standing or not (note 1169):
    // a crystal is out of the sword's reach on its pillar, and a new place
    // to shoot one from is no use with nothing to shoot. The sword at the
    // perch is what is left, said with the crystals that still heal it.
    const noArrows = arrowsLeft === 0 && !throwing;
    const standing = crystals.length + (remembered ? unresolved.length : 0);
    const fountain = ((!crystals.length && !remembered) || noArrows) && dragon && !head && arrowsLeft <= FEW_ARROWS
      ? { name: 'fountain', position: new Vec3(centre.x, bot.entity.position.y, centre.z), range: PERCH_RANGE, arrows: arrowsLeft, crystals: standing } : null;
    // Throwing, a caged crystal is not the one gone for: its bars stop a throw (note 1343).
    const focus = (noArrows ? null : (throwing ? (crystals.find(c => !caged(bot, c)) || (pick && crystals.find(c => caged(bot, c)))) : crystals[0]) || (remembered && { name: 'unresolved_crystal_location', position: vector(remembered.position) })) ||
      head || fountain || dragon || (state.arenaCenter && vector(state.arenaCenter)) || (state.lastDragon && vector(state.lastDragon.position));
    // Reposition when arcs are blocked or the dragon is perched, and always
    // expose escape positions when healing or avoiding a breath cloud.
    // By the fountain already, the wait is there: no walk to another cell of its ring.
    const waitingThere = focus === fountain && fountain && Math.abs(byFountain - PERCH_RANGE) <= 3 && safe;
    // No walk from the bot's own column or an obsidian top (note 1520): the ways off are the column, the drop and pillar_top_down, and a walk there is a fall. 25588 (dragon-82, 2026-10-13 20:55Z, four crystals broken) on crystal 96's top at 85 with no bucket and no pool chose move_-5,3 and move_-4,3 three times running and died 23 blocks below.
    // The walks stay on offer while the dragon perches (note 1528): with the run under the head the only other way than a watch, 25588 chose it 0.38 to 0.49 against none good 0.35 to 0.58 (dragon-87, 2026-10-13 21:54 to 22:00Z), lost 16 health to one run, and the day's runs struck the head not once; the perch is the quietest minute for a walk to the next pillar's foot.
    if (!onOwnPillar() && !onObsidianTop() && (!Object.keys(tree).some(key => key.startsWith('crystal_') || key.startsWith('throw_')) || bot.health < 16) && !waitingThere && !tree.strike_head) for (const route of await arenaRoutes(bot, task, goal, policy, focus, { throwing })) {
      tree[`move_${route.key}`] = { description: { action: focus?.name === 'unresolved_crystal_location'
        ? 'Approach a previously observed crystal location to check whether the crystal remains. Loss of entity tracking did not establish destruction.'
        : !safe ? 'Escape the unsafe current position along this surveyed route'
        : focus?.name === 'ender_dragon_head' ? 'Approach the perched head to get within sword reach'
        : focus?.name === 'fountain' ? `Go to stand about ${PERCH_RANGE} blocks from the fountain the dragon perches on, and wait there for the sword at its head when it lands (it stays perched only while a player is within 20 blocks of it, and alone there leaves after five seconds: a wait that ended at 19 to 20 lost it, and six of seven runs under its head today began too far and ended 'took off'; within the 20 it sits a second scanning, two rearing, up to ten breathing toward the player, then takes off): ${focus.arrows} arrow${focus.arrows === 1 ? ' is' : 's are'} left, the sword reaches the dragon only at its perch, and at its perch arrows do nothing to it${focus.crystals ? `; ${focus.crystals} healing crystal${focus.crystals === 1 ? ' still stands' : 's still stand'} on ${focus.crystals === 1 ? 'its pillar' : 'their pillars'}, out of the sword's reach, and ${focus.crystals === 1 ? 'heals' : 'heal'} the dragon while it flies near` : ''}`
        : focus?.name === 'end_crystal' ? (throwing ? 'Go closer under an observed healing crystal, within a throw of it' : 'Change firing position for an observed healing crystal')
        : 'Reposition along this surveyed route to gain a future attack opportunity',
        position: { ...route.p }, visits: state.visits[route.key] || 0, target: focus?.name,
        clearCrystalShot: focus?.name === 'end_crystal' ? route.clearCrystalShot : undefined,
        targetDistance: route.targetDistance, currentTargetDistance: focus?.position?.distanceTo(bot.entity.position),
        desiredHorizontalRange: route.desiredHorizontalRange,
        voidEdgeBlocks: voidEdge(bot, vector(route.p)), endermenNearRoute: endermenNearRoute(bot, bot.entity.position, vector(route.p)),
        ...(dragon ? { dragonBlocksFromRoute: dragonNearRoute(dragon, bot.entity.position, vector(route.p)), dragonPerched: perched(bot, dragon) } : {}),
        // Said (note 1544) when the walk ends by the fountain while the dragon sits there or comes down to it.
        ...(dragon && (perched(bot, dragon) || [2, 3].includes(metadata(bot, dragon, 'phase'))) ? { perchBody: `ends ${Math.round(Math.hypot(route.p.x + .5 - centre.x, route.p.z + .5 - centre.z))} blocks from the fountain's middle, where the dragon ${perched(bot, dragon) ? 'sits' : 'is coming down to sit'}: its body and wings strike what stands within about 8 of it, 4.9 a blow; 25588 (dragon-95, 2026-10-14 00:12Z) walked to 7.6 from it at 14.3 health and took three blows in 1.3 seconds, dead` } : {}),
        ...breathSays(bot, dragon, vector(route.p)) }, run: async () => {
        state.visits[route.key] = (state.visits[route.key] || 0) + 1; save();
        const initiallySafe = safeEndPoint(bot, bot.entity.position);
        // A walk stops for a mob at arm's length: the recorded rehearsal
        // walked twenty blocks under an enderman's blows, 16.2 health to 1.1
        // in eight seconds, and the sword never had a turn.
        await actions.navigate(bot, task, route.destination, { timeoutMs: 18000, stallMs: 4000,
          // And the approach to a perched head ends as the sword reaches
          // it, for strike_head to be offered, not at the spot walked to.
          stopWhen: () => (initiallySafe && !safeEndPoint(bot, bot.entity.position)) || hostileEntities(bot, 4).some(e => live(bot, e)) ||
            (focus?.name === 'ender_dragon_head' && (() => { const h = live(bot, dragon) && perchedHead(bot, dragon); return !!h && canStrike(bot, h); })()) });
      } };
    }
    // Walled in (blocks on every side of the body and over the head, a
    // pocket or a seal of its own from before): no arrow leaves it and no
    // walk, and the fight has only the wait. The way out is offered: the
    // block over the head and the wall toward the arena dug. The rehearsals
    // of 2026-10-03 (23:48Z to 00:10Z) stood in the three-by-three of
    // cobblestone walled at 23:35Z, "observe, the only way offered", every
    // route "noPath" and "no clear arrow trajectory" to a dragon 19 to 37
    // blocks off with no mob near, 187 arrows carried (note 1136).
    const box = actions.dig && enclosed(bot);
    // On the island's low eastern shelf with blocks carried (note 1506): the
    // way up onto the top, a column laid against the cliff's face and a step
    // off it onto the top. The shelf at 40 to 46 meets the top at 56 to 62 in
    // faces of three to six, and the walks to the pillars' feet from it end
    // 'no route' or 'timed out' (25588, dragon-67 to dragon-76, 2026-10-13,
    // five to eight a run, two to four minutes each run down there). The
    // cliff's base: the nearest cell within 24 whose ground is level with
    // the feet and whose neighbour toward the island's middle is three to
    // nine blocks higher, under the sky.
    {
      const feet = bot.entity.position.floored(), carried = blocksCarried(bot);
      const top = (x, z) => { for (let y = feet.y + 18; y >= feet.y - 12; y--) if (bot.blockAt(new Vec3(x, y, z))?.boundingBox === 'block') return y + 1; return null; };
      // Offered beside the climbs to the crystals too (note 1515): from the shelf a crystal's column is twenty blocks taller than from the top and the drop off it a dig of twenty first, and 25588 (dragon-79, 2026-10-13 20:23Z) climbed crystal 13's pillar from 36, a column of 47, with no climb onto the top offered.
      if (feet.y <= 54 && carried >= 8 && !onOwnPillar() && !onObsidianTop()) {
        delete tree.dig_to_sky; // the shelf's overhang is not rock over the head to dig through (note 1512)
        let best = null;
        for (let dx = -24; dx <= 24; dx += 1) for (let dz = -24; dz <= 24; dz += 1) {
          const x = feet.x + dx, z = feet.z + dz; const d = Math.hypot(dx, dz); if (d > 24 || (best && d >= best.d)) continue;
          const here = top(x, z); if (here === null || Math.abs(here - feet.y) > 2) continue;
          for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const up = top(x + ox, z + oz); if (up === null) continue;
            // Faces up to sixteen (note 1512): east of the middle the shelf at 45 meets the top at 56, a face of eleven, and 25588 (dragon-78, 2026-10-13 20:06Z) at (35, 45, -22) had no climb offered and its walks to three pillars' feet fail.
            const rise = up - here; if (rise < 3 || rise > 16) continue;
            if (Math.hypot(x + ox, z + oz) >= Math.hypot(x, z)) continue; // toward the island's middle
            if (bot.blockAt(new Vec3(x + ox, up, z + oz))?.boundingBox === 'block' || bot.blockAt(new Vec3(x + ox, up + 1, z + oz))?.boundingBox === 'block') continue;
            const base = new Vec3(x, here, z); const { deepBeside } = require('./end-safety');
            if (deepBeside(bot, base.offset(.5, 0, .5)) || voidEdge(bot, base.offset(.5, 0, .5), 3) !== null) continue;
            best = { d, base, rise, step: new Vec3(x + ox, up, z + oz) }; break;
          }
        }
        if (best) tree.climb_to_the_top = { description: { action: `The bot stands on the island's low shelf at ${feet.y}, below its top: walk ${Math.round(best.d)} blocks to the cliff's base at (${best.base.x}, ${best.base.z}), lay a column of ${best.rise} blocks against its face from the ${carried} carried, and step off it onto the top at ${best.step.y}, where the pillars' feet are walked to. The walks to the pillars' feet from the shelf have ended 'no route' or 'timed out' this fight and others.`,
            blocksCarried: carried, climb: best.rise, blocksToTheBase: Math.round(best.d), health: bot.health },
          run: async () => {
            goal.step = { action: 'climb_to_the_top', base: { ...best.base }, rise: best.rise }; save();
            try { await actions.navigate(bot, task, new goals.GoalBlock(best.base.x, best.base.y, best.base.z), { timeoutMs: 30000, stallMs: 6000 }); }
            catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
            const at = bot.entity.position.floored();
            if (Math.abs(at.x - best.base.x) + Math.abs(at.z - best.base.z) > 1) throw new Error(`The cliff's base was not reached: at ${at}, ${Math.round(bot.entity.position.distanceTo(best.base.offset(.5, 0, .5)))} blocks off`);
            const pr = require('./pillar-recovery');
            await pr.pillarUp(bot, task, best.step.y, { dig: actions.dig, maxBlocks: best.rise + 2, threats: false });
            if (Math.floor(bot.entity.position.y) < best.step.y) throw new Error(`The column against the cliff stopped ${best.step.y - Math.floor(bot.entity.position.y)} short`);
            await require('./motion').move(bot, task, { label: 'onto_the_top', keys: ['forward'], sneak: true, look: best.step.offset(.5, 1.6, .5), maxMs: 2500, tick: 25,
              until: () => Math.floor(bot.entity.position.x) === best.step.x && Math.floor(bot.entity.position.z) === best.step.z });
            delete bot._pillarUp;
            if (Math.floor(bot.entity.position.x) === best.step.x && Math.floor(bot.entity.position.z) === best.step.z) { progress = true; console.log(`[end combat] up onto the island's top at ${bot.entity.position.floored()}`); }
            else throw new Error(`The step onto the top was not taken: at ${bot.entity.position.floored()}`);
            // In off the cliff's lip in the same run (note 1571): the top's edge
            // is where the first pass after the climb lands, a fireball's cloud
            // on arrival with the void a step back and the escape pillar's
            // foot on the lip. 25588 died there four times on 2026-10-14
            // (dragon-98, 116, 118 drowned off it, 119 at (48, 49, -26),
            // 14.5 to 0 by breath under its own pillar). Six blocks toward the
            // island's middle, the ground within three of the top's level.
            {
              const centre = state.arenaCenter ? vector(state.arenaCenter) : new Vec3(0, best.step.y, 0);
              const dx = centre.x - (best.step.x + .5), dz = centre.z - (best.step.z + .5), len = Math.hypot(dx, dz) || 1;
              let inward = null;
              for (const d of [6, 5, 4, 3]) {
                const x = Math.floor(best.step.x + .5 + dx / len * d), z = Math.floor(best.step.z + .5 + dz / len * d);
                const y = top(x, z); if (y === null || Math.abs(y - best.step.y) > 3) continue;
                if (bot.blockAt(new Vec3(x, y, z))?.boundingBox === 'block' || bot.blockAt(new Vec3(x, y + 1, z))?.boundingBox === 'block') continue;
                inward = new Vec3(x, y, z); break;
              }
              if (inward) {
                try { await actions.navigate(bot, task, new goals.GoalBlock(inward.x, inward.y, inward.z), { timeoutMs: 12000, stallMs: 4000 }); }
                catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
                console.log(`[end combat] in off the cliff's lip: ${Math.round(bot.entity.position.distanceTo(best.step.offset(.5, 0, .5)))} blocks in at ${bot.entity.position.floored()} (${inward} wanted)`);
              } else console.log(`[end combat] in off the cliff's lip: no level ground found within six toward the island's middle`);
            }
          } };
      }
    }
    // The wait in a hole by the fountain (note 1592): the dragon's wings push
    // every body in their boxes 4 / d² and hurt it 5, and as it takes off from
    // its perch its body throws what stands beside it high. 25588 (dragon-136,
    // 2026-10-14 07:05Z, seven crystals broken) ran under the head from 19
    // blocks, the dragon took off as it came within 8, and the body went to
    // y 90 and fell 28, dead; dragon-121 and 130 ended the same way at six
    // crystals. A body two deep in the island's ground is below the wings'
    // boxes and below the breath's cloud (half a block deep where it bursts);
    // the perch goes on while a player stands within 20, hole or no hole;
    // out of the hole is two blocks laid, about a second. Offered on the
    // island's ground within 24 of the fountain while the dragon flies.
    if (actions.dig && fountain && !onOwnPillar() && !onObsidianTop() && !holeHere() && !(dragon && perched(bot, dragon)) && byFountain <= 24 && byFountain >= 6 && blocksCarried(bot) >= 2) {
      const feet = bot.entity.position.floored();
      const thick = [1, 2, 3, 4, 5, 6].every(dy => bot.blockAt(feet.offset(0, -dy, 0))?.boundingBox === 'block');
      const wallsHold = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => bot.blockAt(feet.offset(dx, -1, dz))?.boundingBox === 'block' && bot.blockAt(feet.offset(dx, -2, dz))?.boundingBox === 'block');
      if (thick && wallsHold && voidEdge(bot, bot.entity.position, 4) === null) tree.wait_in_hole = {
        description: { action: `Dig two blocks down under the feet here, ${Math.round(byFountain)} blocks from the fountain, and wait in the hole for the dragon to perch: two deep in the ground the body is below the wings' push (4 over the squared distance a tick, 5 of hurt, the throw off the island) and below the breath's cloud; the dragon keeps its perch while a player stands within 20 of it, in a hole or not; the way out is two blocks laid, about a second, and the run to the fountain from here ${Math.round(byFountain / 5.6 * 10) / 10} s more. The wait is a second a question, as observe is.`,
          blocksFromFountain: Math.round(byFountain), health: bot.health, blocksCarried: blocksCarried(bot), dragonBlocksOff: dragon ? Math.round(dragon.position.distanceTo(bot.entity.position)) : null,
          record: 'the take-off\'s throw ended dragon-121, 130 and 136 on 2026-10-14 at six or seven crystals, each standing in the open by the fountain or on its way to it' },
        run: async () => {
          // The cell taken where the body stands when the run begins (note 1598), not where it stood when the option was built a question earlier: 25588 (dragon-141, 2026-10-14 08:01Z) was 0.81 off the cell it tried to centre on, a cell away, 'the body still on the rim'. The ground read again for it.
          const feet = bot.entity.position.floored();
          const thickHere = [1, 2, 3, 4, 5, 6].every(dy => bot.blockAt(feet.offset(0, -dy, 0))?.boundingBox === 'block') && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => bot.blockAt(feet.offset(dx, -1, dz))?.boundingBox === 'block' && bot.blockAt(feet.offset(dx, -2, dz))?.boundingBox === 'block') && voidEdge(bot, bot.entity.position, 4) === null;
          if (!thickHere) throw new Error(`The ground at ${feet} is not the hole's: thin, open beside, or the void within four`);
          goal.step = { action: 'wait_in_hole', at: { ...feet } }; save();
          // Centred on the cell first (note 1595): a body 0.6 wide at a cell's edge stands on the rim when the cell under it is dug, and 25588 (dragon-139, 2026-10-14 07:35Z) dug its hole at (10, 60, 16) and stayed at 60, 'a side open'.
          const centre = feet.offset(.5, 0, .5), off = () => Math.hypot(centre.x - bot.entity.position.x, centre.z - bot.entity.position.z);
          for (let i = 0; i < 20 && off() > 0.12; i++) { check(); try { await bot.lookAt(centre.offset(0, 1.6, 0), true); } catch (_) { /* looked */ } bot.setControlState?.('sneak', true); bot.setControlState?.('forward', true); await sleep(off() > 0.4 ? 100 : 50); bot.setControlState?.('forward', false); await sleep(60); }
          bot.setControlState?.('sneak', false);
          for (const dy of [1, 2]) { check(); await actions.dig(bot, task, feet.offset(0, -dy, 0), { requireDrops: false }); }
          for (let i = 0; i < 30 && Math.floor(bot.entity.position.y) > feet.y - 2; i++) await sleep(50);
          const inIt = Math.floor(bot.entity.position.y) <= feet.y - 2;
          if (inIt) { state.hole = { x: feet.x, y: feet.y - 2, z: feet.z, at: Date.now() }; save(); }
          console.log(`[end combat] ${inIt ? 'in the hole' : 'not down into the hole'} at ${bot.entity.position.floored()} (${Math.round(off() * 100) / 100} off the cell's middle), ${Math.round(byFountain)} from the fountain: ${holeHere() ? 'walled on four sides' : inIt ? 'a side open' : 'the body still on the rim'}`);
          if (!inIt) throw new Error('The body did not go down into the hole');
          progress = true;
        } };
    }
    // In the hole: the wait is its own option, said; every other option climbs out first (the dispatch below).
    if (holeHere()) tree.stay_in_hole = { description: { action: `Stay in the hole another second: two deep in the ground, below the dragon's wings and the breath's cloud; the fountain ${fountain ? Math.round(byFountain) : '?'} blocks off, the way out two blocks laid`, health: bot.health, dragonPerched: !!(dragon && perched(bot, dragon)), dragonBlocksOff: dragon ? Math.round(dragon.position.distanceTo(bot.entity.position)) : null },
      run: async () => { for (let n = 0; n < 10; n++) { check(); if (dragon && perched(bot, dragon)) break; await sleep(100); } } };
    // Under the island's rock with a pickaxe (note 1488): the way up to the sky,
    // the blocks over the head dug and the column laid under the feet
    // (pillarUp with end stone diggable). 25588 (dragon-66, 2026-10-13 16:30Z)
    // quarried itself into tunnels four to fourteen blocks under the island's
    // top, and from there every pillar's foot was 'not reached'; the fight's
    // options had no way out.
    {
      const feet = bot.entity.position.floored();
      // Rock, not the roof the column lays over the head (note 1490): three solid blocks or more in the thirty above, and not on the bot's own column or an obsidian top. 25588 (dragon-67, 2026-10-13 16:45Z) was offered the dig to the sky on its column under its own roof, and the least bad took it four times.
      let rock = 0, solidAbove = 0; for (let dy = 1; dy <= 30; dy++) if (bot.blockAt(feet.offset(0, dy, 0))?.boundingBox === 'block') { rock = dy; solidAbove++; }
      const pick = bot.inventory.items().find(i => /_pickaxe$/.test(i.name));
      if (rock >= 2 && solidAbove >= 3 && !onOwnPillar() && !onObsidianTop() && pick && actions.dig && blocksCarried(bot) >= 1) {
        const skyY = feet.y + rock + 1;
        tree.dig_to_sky = { description: { action: `The bot stands under the island's rock, ${rock} blocks of it over its head to the open sky at ${skyY}: dig up to the sky, the blocks over the head dug with the ${pick.name.replace('_', ' ')} and the column laid under the feet from the ${blocksCarried(bot)} blocks carried. No pillar's foot is walked to from down here.`,
          rockOverhead: rock, blocksCarried: blocksCarried(bot), health: bot.health },
          run: async () => {
            const pr = require('./pillar-recovery');
            goal.step = { action: 'dig_to_sky', from: { ...bot.entity.position }, to: skyY }; save();
            await pr.pillarUp(bot, task, skyY, { dig: actions.dig, maxBlocks: rock + 2, threats: false, canDig: b => !!b && b.diggable && b.name !== 'bedrock' && b.name !== 'obsidian' });
            if (Math.floor(bot.entity.position.y) >= skyY - 1) { progress = true; delete bot._pillarUp; }
            else throw new Error(`The way up stopped ${skyY - Math.floor(bot.entity.position.y)} short of the sky`);
          } };
      }
    }
    // Not in the bot's own pocket on its column (note 1579): its ways out are the drop through the pool side's wall and the dig down, both offered; opening the roof is the fireball's way in. 25588 (dragon-127, 2026-10-14 05:13Z) took open_walls at 0.55 in its pocket under the breath and died at 77.
    if (box && !onColumnCell() && !tree.shoot_dragon && !Object.keys(tree).some(k => /^(crystal_|move_|strike_head|bed_bomb)/.test(k))) {
      const toward = (focus === fountain ? dragon : focus)?.position || focus || (state.arenaCenter && vector(state.arenaCenter)) || bot.entity.position.offset(1, 0, 0);
      const feet = bot.entity.position.floored(), dx = toward.x - (feet.x + .5), dz = toward.z - (feet.z + .5);
      const side = Math.abs(dx) >= Math.abs(dz) ? new Vec3(Math.sign(dx) || 1, 0, 0) : new Vec3(0, 0, Math.sign(dz) || 1);
      const cells = [feet.offset(0, 2, 0), feet.plus(side).offset(0, 1, 0), feet.plus(side)].filter(c => bot.blockAt(c)?.boundingBox === 'block');
      tree.open_walls = { description: { action: `The bot stands walled in, blocks on every side of it and over its head (${box.of}): no arrow leaves it and no walk. Open it: dig the block over the head and the wall toward the arena, ${cells.length} block${cells.length === 1 ? '' : 's'}, and the fight goes on from the opening`,
        health: bot.health, turnedEndermenWithinTwenty: hostileEntities(bot, 20).filter(e => live(bot, e) && e.name === 'enderman').length, dragonBlocksOff: dragon ? Math.round(dragon.position.distanceTo(bot.entity.position)) : null },
        run: async () => {
          for (const c of cells) { check(); await actions.dig(bot, task, c, { requireDrops: false }); }
          state.opened = (state.opened || 0) + 1; progress = true; save();
        } };
    }
    // No walk off the footing and the void beside it (the entry platform,
    // where it stands apart from the island): a span of the blocks carried
    // toward the island is offered, laid crouched a stretch at a time
    // (bridging.js, note 1154). The rehearsal of 2026-10-04 (01:48:20 to
    // 01:49:18Z), its platform 29 blocks from the island, had "observe" and
    // a shot at the dragon as its ways, every route "noPath", and stood
    // there until the dragon's wing threw it off into the void.
    if (!Object.keys(tree).some(k => k.startsWith('move_')) && !box && !inWater()) {
      const { deepBeside } = require('./end-safety');
      const bridging = require('./bridging');
      const here = bot.entity.position, near = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => deepBeside(bot, here.offset(dx, 0, dz)));
      const blocks = (() => { try { return bot.inventory.items().filter(i => ['cobblestone', 'cobbled_deepslate', 'stone', 'dirt', 'netherrack', 'andesite', 'diorite', 'granite', 'blackstone', 'basalt'].includes(i.name)).reduce((n, i) => n + i.count, 0); } catch (_) { return 0; } })();
      const centre = state.arenaCenter ? vector(state.arenaCenter) : new Vec3(0, here.y, 0);
      const stone = bot.findBlocks({ matching: bot.registry.blocksByName.end_stone.id, maxDistance: 64, count: 64 }).map(p => ({ p, d: Math.hypot(p.x + .5 - here.x, p.z + .5 - here.z) })).sort((a, b) => a.d - b.d)[0];
      // Apart from the island: none of its ground within three blocks.
      if (near && blocks >= 4 && bot.entity.onGround !== false && (!stone || stone.d > 3)) {
        const to = stone ? stone.p : centre, STRETCH = 12;
        tree.bridge_to_island = { description: { action: `Lay a span of the blocks carried toward the island, one wide and laid crouched (a crouched player does not walk off an edge), up to ${STRETCH} blocks at a time: no walk leads off this footing, the void is beside it, and the dragon's wing throws a player from where it stands`,
          blocksCarried: blocks, islandGroundBlocksOff: stone ? Math.round(stone.d) : null, health: bot.health, dragonBlocksOff: dragon ? Math.round(dragon.position.distanceTo(here)) : null },
          run: async () => {
            const from = here.clone();
            goal.step = { action: 'end_bridge', toward: { x: to.x, y: Math.floor(here.y), z: to.z }, blocks }; save();
            // The steps cover the cells already laid and the stretch (note
            // 1433): the span walks what stands before it lays, and with
            // twelve steps for twelve blocks a span twelve long is walked to
            // its end and nothing laid. 25588 (dragon-6 to dragon-17,
            // 2026-10-13) stood on the entry platform of mid-243-ma-end-3 with
            // its span of twelve to (91, 48, 5), the island's stone two blocks
            // on at (89, 48, 8), and walked the span out and back every ten
            // seconds, "changed nothing", until the dragon knocked it off.
            const placed = await bridging.bridgeTo(bot, task, new Vec3(to.x, Math.floor(here.y), to.z), { maxBlocks: STRETCH, maxSteps: spanSteps(here, to, STRETCH) });
            state.bridged = (state.bridged || 0) + placed; if (placed > 0 || bot.entity.position.distanceTo(from) >= 2) progress = true; save();
          } };
      }
    }
    // Off the island with the void beside it (the entry platform apart from
    // it, or the span laid from it: the floor not the island's own stone)
    // and no walk off: onto the island before anything else, by the drop to
    // its ground under the edge where there is one, else by the span. This
    // is the body's safety, not a choice (note 1160): the dragon's wing
    // throws whatever stands there, and under it is the void. The
    // rehearsals of 2026-10-04 (01:49Z, 02:54Z) chose a crystal's shot and a
    // look from the platform and from the end of their own span, the
    // island's ground six blocks under it, and were thrown off: "fell out
    // of the world", twice.
    {
      const { deepBeside } = require('./end-safety');
      const here = bot.entity.position, floorName = bot.blockAt(here.floored().offset(0, -1, 0))?.name;
      const offIsland = !!floorName && !['end_stone', 'bedrock', 'air'].includes(floorName) && !box && !inWater() && bot.entity.onGround !== false &&
        [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => deepBeside(bot, here.offset(dx, 0, dz)));
      if (offIsland) {
        // A walk off it, where the shots on offer left the routes unlooked for.
        const walkOff = Object.keys(tree).some(k => k.startsWith('move_')) || (await arenaRoutes(bot, task, goal, policy, focus)).length > 0;
        if (!walkOff) {
          if (await leaveHighGround(bot, task, goal, save, state)) { progress = true; return; }
          if (tree.bridge_to_island) { await tree.bridge_to_island.run(); return; }
        }
      }
    }
    // A pause can reveal a vulnerable phase, but it must not indefinitely
    // displace executable actions. Renew that allowance only after actual
    // movement, damage, crystal destruction or observed health recovery.
    // Watching stays a choice beside the others (note 1343): taken away
    // after five idle watches it left under_head the only way, and the
    // arena's drill of a bare kit (2026-10-06 02:03Z) ran under the perched
    // head at 14.9 health and died there. The watches without progress are
    // said with it.
    // Beside the run under the head it is a choice even where the bot does
    // not stand safe (note 1405): with the run the only way offered, the
    // dragon stage of 2026-10-07 (25588, 20:38:58Z) went under a dragon 18
    // seconds into its perch and was thrown to its death as it took off.
    if ((safe || tree.under_head) && dragon) tree.observe = {
      description: { action: 'Wait one second without attacking or moving',
        health: bot.health, canRegenerate: bot.health < 20 && bot.food >= 18,
        usefulAttackAvailableNow: !!tree.shoot_dragon || !!tree.strike_head || crystals.some(c => tree[`crystal_${c.id}`]),
        dragonPhase: metadata(bot, dragon, 'phase'), pausesWithoutProgress: state.idleObservations || 0,
        // Said where the wait is on the bot's own column or a pillar's top (note 1566): the dragon's pass there is its body, and the wait at 95 cost 25588 its life. dragon-114 (2026-10-14 03:27Z, six crystals broken) waited twice at 6.5 to 8.3 health on crystal 119's column top with no bucket and no pool, took two blows of the pass (9.8 to 4.6) and was flung 32 blocks down; dragon-112 (02:39Z) the same at 71, carried 30 blocks.
        ...((onOwnPillar() || onObsidianTop()) ? { standingHere: `on ${onObsidianTop() ? 'a pillar\'s top' : 'the bot\'s own column'} at ${Math.floor(bot.entity.position.y)}, ${Math.floor(bot.entity.position.y) - 62} over the island, where the dragon's pass is its body and the breath: 25588 waited so twice today and was carried off both times, 30 blocks (dragon-112, 02:39Z) and 32 (dragon-114, 03:27Z, at 6.5 health), dead; the ways down are the dig (pillar_down, about a second and a half a block) and the drop into a pool where one lies` } : {}) }, run: async () => {
      state.idleObservations = (state.idleObservations || 0) + 1;
      bot.clearControlStates(); for (let n = 0; n < 10; n++) { check(); if (!safeHere()) break; await sleep(100); }
    } };
    // Unsafe only because of mobs close by (endermen turned by a glance or a
    // crystal's blast): hold with the sword out for them to come, and the
    // next step looks again. The no-progress budget still bounds it. As Blocked
    // it ended the rehearsal with the dragon at 148 of 200.
    // The dragon close with no surveyed way out holds the same way: it flies
    // on in seconds. Down in the exit portal's basin with the dragon over it,
    // the fresh-End rehearsal (2026-09-24) called that Blocked a minute in,
    // five crystals down, which in the run would end the fight.
    // Off an obsidian pillar's top, where a blow at its crystal left the bot
    // (note 1414): back to the bot's own column and down it. The drill of
    // 2026-10-13 (04:14Z) stood on the top after its blow, 36 up, offered
    // only moves about the top.
    // The water left standing, walked back to for the bucket (note 1572): the
    // step's own walk-back reaches sixteen blocks, and 25588 (dragon-120,
    // 2026-10-14 04:05Z) left its pool at (-36, 61, 19), fought an enderman,
    // walked off to crystal 88 and climbed it with both buckets empty, 'no
    // water bucket carried' at the top. Offered on the ground whenever the
    // water is carried in no bucket and lies somewhere within sixty.
    if (!onOwnPillar() && !onObsidianTop() && countOf(bot, 'water_bucket') === 0 && countOf(bot, 'bucket') > 0 && Array.isArray(state.poolsLeft) && state.poolsLeft.length) {
      state.poolsLeft = state.poolsLeft.filter(w => Date.now() - w.at < 20 * 60000 && bot.blockAt(new Vec3(w.x, w.y, w.z))?.name === 'water');
      const here = bot.entity.position, w = state.poolsLeft.map(w => ({ w, d: here.distanceTo(new Vec3(w.x + .5, w.y, w.z + .5)) })).filter(x => x.d <= 60).sort((a, b) => a.d - b.d)[0];
      if (w) tree.take_back_water = {
        description: { action: `Walk ${Math.round(w.d)} blocks to the water left standing at (${w.w.x}, ${w.w.y}, ${w.w.z}) and take it back into the empty bucket: no water is carried now, so no pool can be poured at the next pillar's foot and the way down from its top is the dig, a minute or more on the column; the walk is out in the open with the dragon's passes and breath about it (${Math.round(w.d / 4.3)} seconds or so)`,
          blocksOff: Math.round(w.d), emptyBuckets: countOf(bot, 'bucket'), health: bot.health, dragonBlocksOff: dragon ? Math.round(dragon.position.distanceTo(here)) : null },
        run: async () => {
          const p = new Vec3(w.w.x, w.w.y, w.w.z);
          goal.step = { action: 'take_back_water', to: { x: p.x, y: p.y, z: p.z }, blocks: Math.round(w.d) }; save();
          try { await actions.navigate(bot, task, new goals.GoalNear(p.x, p.y, p.z, 2), { timeoutMs: 25000, stallMs: 5000 }); } catch (err) { if (['Cancelled', 'Blocked', 'EndEmergency', 'NeedsAir'].includes(err.name)) throw err; }
          const eye = bot.entity.position.offset(0, 1.62, 0);
          if (eye.distanceTo(p.offset(.5, .5, .5)) > 4.3) throw new Error(`The water at ${p} was not reached: ${Math.round(bot.entity.position.distanceTo(p.offset(.5, 0, .5)))} blocks off`);
          const { fillWaterBucket } = require('./water');
          await fillWaterBucket(bot, task, p, { timeoutMs: 1500 });
          const full = countOf(bot, 'water_bucket');
          console.log(`[end combat] the water left at ${p} taken back into the bucket (${full} full carried)`);
          state.poolsLeft = state.poolsLeft.filter(x => x !== w.w); if (state.pool && state.pool.x === p.x && state.pool.z === p.z) delete state.pool; save();
          if (!full) throw new Error(`The water at ${p} did not go into the bucket`);
          progress = true;
        } };
    }
    if (onObsidianTop() && bot._pillarUp) tree.pillar_top_down = {
      description: { action: `Walk back to the bot's own pillar at the top's edge, ${Math.round(Math.hypot(bot._pillarUp.x + .5 - bot.entity.position.x, bot._pillarUp.z + .5 - bot.entity.position.z))} blocks off, and dig down it a block at a time from under the feet to the island: no fall on the way`, health: bot.health, dragonHealth: beforeDragon },
      run: async () => { if (!await backToColumn()) throw new Error('The bot\'s own column was not reached from the pillar\'s top'); await digDownColumn(); } };
    // Down its own pillar, a block at a time from under the feet (note
    // 1344): on top of one laid for a throw, the footing is a block wide and
    // nothing else is offered, and the drill of 2026-10-06 (04:16Z) held on
    // top of a 35-block pillar.
    // The bot's pillar is the column under its feet (onOwnPillar, note 1418),
    // not the cell last recorded: a cell off it, 25588 (dragon-7, 2026-10-13
    // 05:50Z) read no pillar of its own 35 up, dropped the record, and was
    // left to the stall's moves and the dragon's blow.
    const ownPillar = onOwnPillar();
    if (ownPillar && actions.dig) {
      const feet = bot.entity.position.floored();
      // The column's depth is its height over the island (note 1446): its
      // blocks and the gaps between them (note 1434) down to the first block
      // that is not the column's. End stone is the column's above the island
      // (note 1438). Counted only through its own blocks, a column with a
      // gap or laid in end stone was 'depth 1', no way down was offered, and
      // 25588 (dragon-27, 2026-10-13 09:24Z), crystal 76 broken, stood 'only
      // observe' on its column at 79 until the dragon knocked it off.
      let depth = 0, gap = 0;
      for (; depth < 64; depth++) {
        const c = feet.offset(0, -1 - depth, 0), b = bot.blockAt(c), name = b?.name || '';
        if (b?.boundingBox !== 'block') { if (++gap > 6) break; continue; }
        gap = 0;
        if (!SCAFFOLD_UNDER.test(name)) break;
        // The sides read from one under the block (note 1581): the pocket's posts (note 1575) stand beside the block under the feet, and with them every side read 'solid within three', the column's end stone read as the island's, and 25588 (dragon-129, 2026-10-14 05:35Z) on its column at 88 had no pillar_down, 'only observe'.
        if (name === 'end_stone' && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => { for (let dy = 1; dy <= 3; dy++) if (bot.blockAt(c.offset(dx, -dy, dz))?.boundingBox === 'block') return true; return false; })) break;
      }
      depth -= gap;
      if (!SCAFFOLD_UNDER.test(bot.blockAt(feet.offset(0, -1, 0))?.name || '')) depth = 0;
      // The island's own end stone is no pillar of the bot's (note 1351): the
      // drill of 2026-10-06 (05:52Z on) was offered this on the ground 755
      // times, each changing nothing.
      // Not on the pillar's top (note 1493): standing on the obsidian, the
      // bedrock or the cage's bars after the blow, the column is beside the
      // body, not under it, and the record is the way back to it. 25588
      // (dragon-68, 2026-10-13 17:08Z, crystals 12 and 90 broken) struck 90
      // from the top, had its record dropped on the obsidian at (-13, 79, 37),
      // 'column undefined', and stood 'only observe' with no way down.
      const underName = bot.blockAt(feet.offset(0, -1, 0))?.name || '';
      // Dropped only on the island's own ground (note 1527): on air at the top's rim, the body's middle over the edge, the record is still the way back. 25588 (dragon-87, 2026-10-13 21:51Z, two crystals broken) stood 'on air' at (-17, 88, -37) after the blow, 'column undefined', 'only observe' nine times.
      if (depth < 1 && underName === 'end_stone' && feet.y < 70) delete bot._pillarUp;
      // The drop beside the dig (note 1572): on the column after the blow the
      // way down was asked as 'observe or pillar_down' when the blow's run was
      // cut short before its own way down, and 25588 (dragon-120, 2026-10-14
      // 04:03Z, crystal 104 broken) dug 22 blocks down at (-36, 85, 21) with
      // its pool poured two blocks from the foot, a minute on the column for a
      // second's step. Offered wherever the dig is, with the side, the fall
      // and what lies under it.
      if (depth >= 2 && onOwnPillar()) {
        const side = waterDropSide(), water = countOf(bot, 'water_bucket');
        // The pool's side walled by the pocket's own blocks (notes 1575, 1577): offered still, the wall dug first.
        const walled = side?.clearFirst && state.pool && Date.now() - state.pool.at < 15 * 60000 ? { dx: state.pool.dx, dz: state.pool.dz, fall: Math.max(0, Math.floor(bot.entity.position.y) - state.pool.y), edge: { x: bot._pillarUp.x + state.pool.dx, z: bot._pillarUp.z + state.pool.dz }, pool: true, cells: side.clearFirst.length } : null;
        if (side && (walled || (!side.clearFirst && (water || side.pool)))) {
          const s0 = walled || side;
          const dir = s0.dx === 1 ? 'east' : s0.dx === -1 ? 'west' : s0.dz === 1 ? 'south' : 'north';
          tree.water_drop = {
            description: { action: `${walled ? `Dig the ${walled.cells} blocks of the bot's own pocket on the column's ${dir} side (a second or two), then step` : 'Step'} off the column's ${dir} edge, ${s0.fall} blocks down onto the island at (${s0.edge.x}, ${s0.edge.z})${s0.pool ? ', into the pool poured at the foot: the landing in water takes nothing' : `, no pool under it: the bucket is clicked under the body in the last blocks of the fall, a click the server refuses about one time in three, and a dry landing takes about ${Math.max(0, s0.fall - 3)}`}; a second or two, against the dig's ${Math.round(depth * 1.5)} seconds on the column where the breath and the passes land`,
              fall: s0.fall, pool: !!s0.pool, walled: !!walled, waterBuckets: water, health: bot.health, dragonHealth: beforeDragon },
            run: async () => {
              goal.step = { action: 'water_drop_chosen', from: { ...bot.entity.position }, fall: (walled || side).fall }; save();
              if (!await waterDrop({ inCloud: breathThreat(bot)?.name === 'area_effect_cloud' })) throw new Error('The water drop was not taken: no side with ground under it, or the fall too long for the health with no pool');
            } };
        }
      }
      if (depth >= 2) tree.pillar_down = {
        description: { action: `Dig down the bot's own pillar a block at a time from under the feet, ${depth} blocks to its foot: no fall on the way${cloudUnderfoot(depth) ? `; ${cloudUnderfootSays(cloudUnderfoot(depth))}` : ''}`, blocks: depth, health: bot.health, dragonHealth: beforeDragon, ...(cloudUnderfoot(depth) ? { breathAtTheFoot: true } : {}) },
        run: async () => {
          // The column's own way down (digDownColumn): a gap under the block filled, end stone counted, the dragon's pass held through (notes 1434, 1438, 1440).
          await digDownColumn({ limit: depth });
          delete bot._pillarUp;
        } };
    }
    if (!Object.keys(tree).length && !safe) {
      state.heldForMobs = { at: Date.now(), unsafe: unsafeBecause(bot, bot.entity.position).slice(0, 6) }; save();
      goal.step = { action: 'end_hold', unsafe: state.heldForMobs.unsafe }; save();
      await defendHere(1000); return;
    }
    // Nothing to do from a height with the island's ground under its edge
    // (the entry platform, a pillar's ledge): the way down off it, before
    // the fight is called blocked (leaveHighGround, note 1131). The
    // rehearsals of 2026-10-03 (23:00 and 23:05Z) ended at their first
    // steps on the entry platform, ten blocks over the island: every route
    // lay more than the three blocks down a route may go, no shot was
    // clear, and "No observed safe End route" ended the fight with 192
    // arrows carried and every crystal standing.
    if (!Object.keys(tree).length && safe && await leaveHighGround(bot, task, goal, save, state)) return;
    if (!Object.keys(tree).length) {
      state.emptyChoice = { at: Date.now(), position: { ...bot.entity.position }, safe, unsafe: safe ? [] : unsafeBecause(bot, bot.entity.position).slice(0, 6),
        crystals: crystals.length, dragon: !!dragon, bow, arrows: countOf(bot, 'arrow'), focus: focus?.name, idle: state.idleObservations || 0 };
      save();
      // One look with nothing to choose is a bad moment, not the end of the
      // fight (note 1132): a second's wait and the next step looks again,
      // counted against the fight's own budget of steps without progress
      // (eighty, above). As a Blocked error it ended three rehearsals of
      // 2026-10-03 within their first half minute (23:00, 23:05 and 23:09Z):
      // on the entry platform, and at the foot of the island's slope a
      // moment after landing, the dragon away and the crystals out of a
      // clear shot.
      state.noProgress = (state.noProgress || 0) + 1; save();
      goal.step = { action: 'end_wait', looks: state.noProgress, crystals: crystals.length, dragon: !!dragon }; save();
      for (let n = 0; n < 10; n++) { check(); await sleep(100); }
      return;
    }
    // An enderman's blow within five seconds, and one within twelve (note 1567):
    // the fight is the only business until it is over. The quarry, the climbs
    // and the walks between its blows were the deaths of dragon-97, 100 and
    // 115 (25588, 2026-10-14): six to seven blows of 4.5 each over ten seconds,
    // the body digging, walking or eating between them, never more than two
    // sword blows landed. What stays: the fight, the water at the feet, the
    // pocket, and the watch in the water.
    {
      const hitAt = bot._hurtBy?.enderman || 0;
      const foeNear = hostileEntities(bot, 12).some(e => live(bot, e) && e.name === 'enderman');
      if (foeNear && Date.now() - hitAt < 5000 && (tree.fight_enderman || tree.water_at_feet || tree.hide_from_enderman)) {
        const keep = new Set(['fight_enderman', 'water_at_feet', 'hide_from_enderman', 'observe']);
        const dropped = Object.keys(tree).filter(k => !keep.has(k));
        for (const k of dropped) delete tree[k];
        if (dropped.length && !(state.endermanStanceSaid > Date.now() - 10000)) { state.endermanStanceSaid = Date.now(); console.log(`[end combat] an enderman's blow ${Math.round((Date.now() - hitAt) / 100) / 10} s ago and one within twelve: the fight first; set aside ${dropped.join(', ')}`); }
      }
    }
    const decision = await decide('dragon_fight', { client, bot, goal, tree, context: { safe }, interrupt: check, watchMs: 50,
      state: endDecisionState({ request: goal.request, health: bot.health, food: bot.food, arrows: countOf(bot, 'arrow'),
        position: { ...bot.entity.position }, safe, dragon: state.dragon,
        // The footing here (note 1557): how many cells of ground within six are open to step to, and whether the void lies beside the feet. The ledge under the entry platform had none, and 25588 (dragon-106, 2026-10-14 01:26Z) chose to shoot from it with two arrows and died in the breath there with no step to take.
        footing: state.routeLook && Date.now() - (state.routeLook.at || 0) < 10000 ? `${state.routeLook.allowed} cell${state.routeLook.allowed === 1 ? '' : 's'} of ground within six to step to${voidEdge(bot, bot.entity.position, 3) !== null ? ', the void within three of the feet' : ''}` : (voidEdge(bot, bot.entity.position, 3) !== null ? 'the void within three of the feet' : undefined),
        head: head && { position: { ...head.position }, reachable: canStrike(bot, head) }, crystals: state.observedCrystals, combat: state }),
      isFresh: () => dimension(bot) === 'end' && bot.health >= healthBefore && bot.entity.position.distanceTo(start) < 1 });
    if (decision.stale) return;
    chose = true;
    if (Object.keys(tree).length === 1 && tree.observe && !(state.onlyObserveSaid > Date.now() - 10000)) {
      state.onlyObserveSaid = Date.now();
      console.log(`[end combat] only observe: standing on ${bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))?.name || 'nothing'} at ${bot.entity.position.floored()}, column ${JSON.stringify(bot._pillarUp)}, own pillar ${onOwnPillar()}, obsidian top ${onObsidianTop()}, safe ${safe}${safe ? '' : ` (${unsafeBecause(bot, bot.entity.position).slice(0, 3).join(', ')})`}, crystals ${crystals.length} (${crystals.slice(0, 3).map(c => `${c.id}@${Math.round(c.position.distanceTo(bot.entity.position))} bedrock:${bot.blockAt(c.position.floored().offset(0, -1, 0))?.name || 'unloaded'} caged:${caged(bot, c)}`).join('; ')}), ${blocksCarried(bot)} blocks; wet ${wet}, dragon phase ${dragon ? metadata(bot, dragon, 'phase') : 'none'} ${dragon ? Math.round(dragon.position.distanceTo(bot.entity.position)) : '-'} off, head ${head ? `${Math.round(head.position.distanceTo(bot.entity.position))} off` : 'none'}, hostiles ${hostileEntities(bot, 64).map(e => `${e.name} ${Math.round(e.position.distanceTo(bot.entity.position))}`).join(', ') || 'none'}, routes ${JSON.stringify(state.routeLook || {})}, quarry ${state.quarryLook && Date.now() - state.quarryLook.at < 5000 ? JSON.stringify(state.quarryLook) : 'not looked'}, no shot: ${noShot}`);
    }
    goal.step = { action: 'end_combat', selected: decision.path, dragonHealth: beforeDragon, observedCrystals: crystals.length }; save();
    // Out of the hole first for anything but the stay (note 1592).
    if (holeHere() && !['stay_in_hole', 'observe'].includes([].concat(decision.path).at(-1))) { try { await outOfTheHole(); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } }
    try { await decision.action.run(); }
    catch (err) {
      if (['Cancelled', 'Blocked', 'EndEmergency'].includes(err.name)) throw err;
      // Moving targets, a newly visible cloud or an obstructed route require
      // a fresh bounded choice. They do not invalidate the retained goal.
      state.lastInterrupted = { at: Date.now(), action: decision.path, reason: err.message }; save();
      console.log(`[end combat] ${[].concat(decision.path).join('/')} ended: ${String(err.message).slice(0, 160)}`);
    }
  } catch (err) {
    if (err.name !== 'EndEmergency') throw err;
    state.lastInterrupted = { at: Date.now(), reason: err.message }; save();
    await respond();
  } finally {
    const after = dragon && metadata(bot, dragon, 'health');
    if (Number.isFinite(after) && after < beforeDragon) { state.lastDamage = { at: Date.now(), before: beforeDragon, after }; progress = true; bot.emit('end_combat', { damage: state.lastDamage }); }
    const cell = `${Math.floor(bot.entity.position.x / 4)},${Math.floor(bot.entity.position.z / 4)}`;
    state.ground ||= {};
    if (start.distanceTo(bot.entity.position) >= 3 && !state.ground[cell]) { state.ground[cell] = true; progress = true; }
    if (progress || start.distanceTo(bot.entity.position) >= 3 || bot.health > healthBefore) state.idleObservations = 0;
    // A step that was the dragon's turn (an evasion, a hold for endermen, a
    // meal) is no choice of the bot's that came to nothing: only a choice
    // made counts against the budget. The rehearsal of 2026-10-03 (23:31 to
    // 23:35Z) spent its eighty in 75 seconds after its last hit, most of
    // them evasions and holds, the dragon at 166.5 of 200, every crystal
    // down and 187 arrows carried (note 1136).
    state.noProgress = progress ? 0 : (state.noProgress || 0) + (chose ? 1 : 0);
    state.lastActionAt = started; save();
    clearInterval(crouchKeeper);
    bot.removeListener('entityMoved', moved); bot.removeListener('physicsTick', falling); task.interruptCheck = oldInterrupt;
    bot.pathfinder.setGoal(null); bot.clearControlStates(); policy.restore();
  }
}

module.exports = { spanSteps, PUNCH_RECORD, punchRecordSays, dragonNearRoute, enclosed, dropOffs, leaveHighGround, voidEdge, endermenNearRoute, metadata, perched, perchedHead, repeatedCrystalMiss, observeArena, endHazards, safeEndPoint, arenaMovement, arenaRoutes, fightEndStep };
