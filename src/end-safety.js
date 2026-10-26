'use strict';
const { move } = require('./motion');
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');
const { surveyRoute, navigate } = require('./skills');
const { dryStanding } = require('./mining-access');
const { fallDanger, recoverFall } = require('./fall-recovery');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function cloudRadius(bot, entity) {
  const index = bot.registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius');
  return Math.max(1, Number(entity.metadata?.[index]) || 3) + 2;
}
// The cloud lies half a block deep on its ground (note 1568): a body whose feet
// are more than a block over it is out of it, two blocks under it as well.
// Read as within three either way, the two-block pillar laid out of the
// breath (note 1557) read as 'the breath at the feet' on the bot's own column,
// and 25588 (dragon-116, 2026-10-14 03:39Z) dug its escape down into the
// cloud it had just climbed out of, 14.6 to none in four seconds.
// A cloud under the feet within three (note 1825): the hole for the body dug down from a stub or a rim ends in the cloud lying on the ground below. 25588's dragon-191 (2026-10-18 05:03Z, one crystal) on its stub at (15, 61, 9) with 'clouds 0.4 off, -2 up' dug 'toward a hole two deep', moved 2 blocks down to (15, 58, 9), 11.9 to 0.4 health in the cloud, dead.
function cloudBelow(bot, blocks = 3) {
  const p = bot.entity.position;
  return Object.values(bot.entities).find(e => e.name === 'area_effect_cloud' && e.isValid !== false && p.y - e.position.y >= 0.5 && p.y - e.position.y <= blocks + 0.5 && Math.hypot(p.x - e.position.x, p.z - e.position.z) <= cloudRadius(bot, e) + 0.5) || null;
}
function hazardDistance(point, entity) {
  if (entity.name !== 'area_effect_cloud') return point.distanceTo(entity.position);
  // Two deep in a hole the body's top (1.8 over the feet) is under the cloud's floor (note 1619): read as in it at exactly two under, the sword from the hole (note 1618) would be cut by its own cloud.
  // Half a block under the feet, not 1.2 (note 1809): the cloud's slab is half a block high from its y, and a body whose feet stand more than that over it is out of it (the arena, 2026-10-15 10:15Z, note 1724: a cloud a block under the feet, none in three seconds; at the feet, nine). Read as in a block over it, the body climbed out of a harmless place: 25588's dragon-174 (2026-10-18 00:2xZ) at (57, 49, 9) with the cloud at 48, 'the breath's cloud at the feet', took 'up out of the breath first' from its hole, came down a block instead (-1 up), and stood in the cloud it had been clear of, 20 to 8 to none with 143 blocks carried.
  // A cloud up to two under the feet still hurts (note 1869): of 21 'hurt by the dragon ... and no emergency by the geometry' lines in 25588's dragon-200 to 224 (2026-10-18), 12 had a cloud within its radius one or two blocks below the feet, the body on its two-block stub or a rim above the cloud, and every hit was the cloud's six. Note 1809 had read a cloud below the feet as a slab the body stands clear of; it is not. Three or more below is unseen in the lines, and left out.
  // And up to two over the feet (note 1870): 25588's dragon-224 (2026-10-18 17:04Z) at (-10, 88, -40) on its column top, 'hurt by the dragon 0.5 s ago ... no emergency by the geometry; clouds 3.3 off, 2 up, radius 8.2', the fireball's cloud on the roof over the head, and the body died there at 4.3. The reach is two and a half either way; a roofed hole two deep puts the cloud three over the feet, outside it, as the drills of 2026-10-17 found.
  // Three either way (note 1877): 25588's dragon-226 (2026-10-18 17:58Z) in its roofed hole for the body at (39, 55, -34), the roof at 57 and the fireball's cloud on it at 58, three over the feet, 'the fireball's cloud on the body: 20.0 to 14.0'. The drills of 2026-10-17 had it the same way: a roof a block thick lets the cloud through, two thick keeps it out.
  // Back to the slab (note 1880): the hurts of notes 1869, 1870 and 1877 were the fireball bursting on the body, whose cloud is then at the body's own height; by the time the line was written the body had stubbed two up, and the cloud read 'two below'. 25588's dragon-228 (2026-10-18 18:23Z) held eight seconds on its stub at (-11, 65, 36) two over a cloud at 9 health, unhurt, until the next fireball burst on it. A cloud is half a block high; what stands over it stands clear of it.
  // The cloud's box, measured (note 1889): scripts/cloud-drill.js on the arena (2026-10-19 01:3xZ) stood the bot still at set heights from a harming cloud laid on a floor, twice each: level with it, 4.5 and 6 lost; one, two, three and four over it, and three and four under a floor beneath it, 0 every time. The cloud is half a block high and hurts what its box touches, note 1809's slab; notes 1869, 1870, 1877 and 1884 read it wider from hurt lines written after the body had moved, or from the dragon's body.
  if (point.y - entity.position.y >= 0.5 || entity.position.y - point.y >= 1.8) return Infinity;
  return Math.hypot(point.x - entity.position.x, point.z - entity.position.z);
}
// A fireball on the ground is an emergency only when it is coming (note 1662): within 20 blocks, or on a line that passes within 7 of the body in under two and a half seconds, read from its last two places. At 48 (note 1469, for the roof on the column) every fireball in the arena cut the walk, the quarry and the climb: 143 cuts on the ground in runs 167 to 197, 109 of them walks, quarries and climbs; 25588 (dragon-197, 2026-10-14 19:17 to 19:40Z) had 23 of them and no crystal in 23 minutes, its walks to crystals 98 and 129 cut seven times. The column keeps 48.
const BALLS = new WeakMap();
function fireballNear(bot, ball, { ground = false } = {}) {
  const here = bot.entity.position, d = ball.position.distanceTo(here);
  if (!ground) return d < 48;
  if (d < 20) return true;
  const now = Date.now(), seen = BALLS.get(ball);
  if (!seen) { BALLS.set(ball, { t0: now, p0: ball.position.clone(), t: now, p: ball.position.clone() }); return false; }
  if (!ball.position.equals(seen.p)) { seen.t = now; seen.p = ball.position.clone(); }
  const dt = (seen.t - seen.t0) / 1000;
  if (dt < 0.15) return false;
  const v = seen.p.minus(seen.p0).scaled(1 / dt), speed = v.norm();
  if (speed < 2) return false;
  const u = v.scaled(1 / speed), r = here.offset(0, 0.9, 0).minus(seen.p), along = r.dot(u);
  if (along <= 0) return false;
  const miss = r.minus(u.scaled(along)).norm();
  return along / speed < 2.5 && miss < 7;
}
function breathThreat(bot, { ground = false } = {}) {
  const entities = Object.values(bot.entities).filter(e => e.isValid !== false);
  return entities.find(e => e.name === 'area_effect_cloud' && hazardDistance(bot.entity.position, e) <= cloudRadius(bot, e)) ||
    entities.find(e => e.name === 'dragon_fireball' && fireballNear(bot, e, { ground })); // 48, not 18 (note 1469): the roof wants the ball seen while it is still far; at 18 it was a second off, and 25588 (dragon-51, 2026-10-13 13:44Z) took the cloud at its feet on the climb, 20 to 2 in two seconds.
}

function dragonThreat(bot) {
  const p = bot.entity.position;
  return Object.values(bot.entities).find(e => {
    if (e.name !== 'ender_dragon' || e.isValid === false) return false;
    const phase = e.metadata?.[bot.registry.entitiesByName.ender_dragon.metadataKeys.indexOf('phase')];
    // Sitting dragons expose their head for melee. Flying bodies/wings and
    // the explicit charging phase need an immediate movement response.
    if ([5, 6, 7, 9].includes(phase)) return false;
    const height = e.position.y - p.y, distance = Math.hypot(e.position.x - p.x, e.position.z - p.z);
    // Coming down to its perch (the landing approach and the landing, phases
    // 2 and 3) it is not charging: only right over the bot is it run from
    // (note 1157). Run from at eighteen blocks, the bot waiting by the
    // fountain for the sword's turn left as the dragon came to sit: in the
    // rehearsals of 2026-10-04 (02:25 to 02:40Z) nine of fourteen runs to
    // the perched head began too far off and ended "took off before".
    if ([2, 3].includes(phase)) return distance < LANDING_CLEAR && height > -6 && height < 14;
    // Twelve, not eighteen (note 1649): the wings' boxes reach about ten aside of the body and six fore and aft, and the day's lifts came at six and nine blocks from it (dragon-154, 164, 2026-10-14); at eighteen every pass over the island cut the quarry and the walk, and 25588 (dragon-183, 16:30 to 16:45Z) had quarry_blocks cut so eleven times with no block carried and dug none in fifteen minutes.
    return phase === 8 && distance < 72 && height > -12 && height < 32 ||
      distance < 12 && height > -6 && height < 14;
  });
}
function endEmergency(bot, opts = {}) {
  if (fallDanger(bot)) return 'dangerous_fall';
  const breath = breathThreat(bot, opts);
  // No charge or fireball emergency for a body shut in (note 1822): two deep with the four sides closed at the feet and the head and a roof two over the feet, the dragon's body has no way to it and a fireball bursts on the roof, its cloud two or more over the head. 25588's dragon-189 (2026-10-18 04:38 to 04:43Z, four crystals, full health) sat so in its roofed hole at (-31, 62, 26) and had wait_in_hole cut by 'dragon_charge_or_contact' 82 times in a hundred lines, Jev asked every second, nothing done. A cloud already on the body still counts.
  const shutIn = (() => { try { if (bot.entity.onGround === false) return false; const f = bot.entity.position.floored(), solid = c => bot.blockAt(c)?.boundingBox === 'block'; return solid(f.offset(0, 2, 0)) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => solid(f.offset(dx, 0, dz)) && solid(f.offset(dx, 1, dz))); } catch (_) { return false; } })();
  if (breath) { if (shutIn && breath.name !== 'area_effect_cloud') return null; return breath.name === 'area_effect_cloud' ? 'dragon_breath_cloud' : 'incoming_dragon_fireball'; }
  if (shutIn) return null;
  if (dragonThreat(bot)) return 'dragon_charge_or_contact';
  return null;
}
function checkEndEmergency(bot, opts = {}) {
  const reason = endEmergency(bot, opts);
  if (reason) throw Object.assign(new Error(reason), { name: 'EndEmergency' });
}

// A deadly fall beside a cell (note 1153): one of the eight columns round it
// with no block for DEEP blocks under its level, the void or a fall nothing
// breaks. A run that ends on such a cell overshoots it: the rehearsal of
// 2026-10-04 (01:38:42 to 01:38:52Z), on the entry platform five blocks
// square and nine from the island, dodged the dragon's fireball at a sprint
// to the platform's corner cell, went over its edge at (102.6, 47, -2.9)
// and "fell out of the world", 36 seconds into the fight.
// The landing dragon's head leads its body by six and a half blocks and
// hurts what it passes through, ten a touch (note 1159): the rehearsal of
// 2026-10-04 (02:48:26 to 02:48:32Z), waiting seven blocks from the
// fountain's middle, was hit there as the dragon came down, 20 health to
// 10 to 5 to none.
const LANDING_CLEAR = 10;
const DEEP = 24, ROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function deepBeside(bot, p) {
  const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
  for (const [dx, dz] of ROUND) {
    let floor = false, loaded = true;
    for (let y = fy; y >= fy - DEEP; y--) {
      const b = bot.blockAt(new Vec3(fx + dx, y, fz + dz));
      if (!b) { loaded = false; break; }
      if (b.boundingBox === 'block') { floor = true; break; }
    }
    if (loaded && !floor) return true;
  }
  return false;
}
// How many of the eight cells about this one have no floor within DEEP blocks.
function voidSides(bot, p) {
  const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
  let sides = 0;
  for (const [dx, dz] of ROUND) {
    let floor = false, loaded = true;
    for (let y = fy; y >= fy - DEEP; y--) {
      const b = bot.blockAt(new Vec3(fx + dx, y, fz + dz));
      if (!b) { loaded = false; break; }
      if (b.boundingBox === 'block') { floor = true; break; }
    }
    if (loaded && !floor) sides++;
  }
  return sides;
}

// A short level corridor is checked across the player's footprint. Running
// sideways can evade a charge; jumping blindly near an island edge cannot.
function dodgeRoutes(bot, dragon, allowed = () => true) {
  const start = bot.entity.position.clone(), toward = dragon.position.minus(start); toward.y = 0;
  const line = toward.norm() > .01 ? toward.unit() : new Vec3(0, 0, 1);
  // From the dragon's charge the way is sideways; from its breath on the
  // ground it is straight out, then the quarters, the sides last (note
  // 1162): a run sideways from inside a cloud keeps to its ring. The
  // rehearsal of 2026-10-04 (03:12:58 to 03:13:01Z) ran from a fireball's
  // cloud past its middle, 20 health to 8.8 to none in three seconds
  // ("killed by Ender Dragon using magic").
  const side = new Vec3(-line.z, 0, line.x), away = line.scaled(-1);
  const quarter = sgn => away.plus(side.scaled(sgn)).unit();
  const directions = dragon.name === 'area_effect_cloud' ? [away, quarter(1), quarter(-1), side, side.scaled(-1)] : [side, side.scaled(-1), away];
  const routes = [];
  for (const direction of directions) {
    let distance = 0;
    // Include the executor's .8-block lookahead; half-block samples can miss
    // a narrow diagonal corner crossed by the player's bounding box.
    for (let sample = 1; sample <= 40; sample++) {
      const d = sample * .2;
      const center = start.plus(direction.scaled(d));
      if (!allowed(center) || ![-.3, .3].every(x => [-.3, .3].every(z => {
        const p = center.offset(x, 0, z);
        return dryStanding(bot, p) && Math.abs(p.y - Math.round(p.y)) < .12;
      }))) break;
      distance = d;
    }
    // Ending at a deadly edge, the run stops a block and a half short of it.
    if (distance >= 2 && deepBeside(bot, start.plus(direction.scaled(distance)))) distance -= 1.5;
    if (distance >= 2) routes.push({ direction, distance, destination: start.plus(direction.scaled(distance)) });
  }
  return routes;
}

// A point RUN_BLOCKS away from `start`, off the bearing to the dragon (away
// first, then the quarters, then the sides), every cell of the line to it
// with a solid block at most two under the feet's level or one over it (a
// step down or up, never the void) and not walled two high. -> Vec3 or null
const RUN_BLOCKS = 6;
// Rough (note 1549): a cell a block up is taken too, with the run's jump, three
// cells at most, when no smooth run of six is to be had. On the island's top
// by the eastern cliff the ground steps up and down a block every few cells,
// and 25588 (dragon-98, 2026-10-14 00:39Z) stood at (58, 53, 9) seventeen
// seconds, 'No surveyed walking escape' twenty-six times, and died in the
// breath's cloud there, 19.3 to none in three seconds, never a step.
function straightAway(bot, start, bearing, allowed = () => true, blocks = RUN_BLOCKS, { rough = false, angles = [Math.PI, Math.PI * .75, -Math.PI * .75, Math.PI / 2, -Math.PI / 2] } = {}) {
  const solid = (x, y, z) => bot.blockAt(new Vec3(x, y, z))?.boundingBox === 'block';
  const feet = Math.floor(start.y);
  for (const angle of angles) {
    const dx = Math.cos(bearing + angle), dz = Math.sin(bearing + angle);
    let ok = true, y = feet;
    for (let d = 1; d <= blocks && ok; d++) {
      const x = Math.floor(start.x + dx * d), z = Math.floor(start.z + dz * d);
      // The floor under this cell: one up, level, or one down (note 1436).
      // Down two or three a cell the run is a fall down a slope, the body in
      // the air past where it meant to stop: 25588 (dragon-19, 2026-10-13
      // 07:56Z, full iron) ran six cells from a fireball down the island's
      // eastern slope, 39 to 37, and went two cells past them over the rim,
      // the water bucket's save with nothing under it to land on.
      // Level or one down only (note 1443): the run holds forward with no
      // jump (note 1428), and a cell a block up stops it at the step. 25588
      // (dragon-24, 2026-10-13 08:58Z), down its column to the island's
      // ground in a hollow, ran one block into the hollow's side from a
      // fireball and stood in the cloud, 12 to none.
      const floor = (rough ? [y, y - 1, y - 2] : [y - 1, y - 2]).find(fy => solid(x, fy, z) && !solid(x, fy + 1, z) && !solid(x, fy + 2, z));
      if (floor === undefined || !allowed(new Vec3(x + .5, floor + 1, z + .5)) || deepBeside(bot, new Vec3(x + .5, floor + 1, z + .5))) ok = false; else y = floor + 1;
    }
    if (ok) return new Vec3(start.x + dx * blocks, y, start.z + dz * blocks);
  }
  return null;
}

// Whether a knock from the dragon's way would carry the body off this cell
// into the void: the one and two cells on from it, away from the dragon,
// with no floor within DEEP blocks.
function knockedIntoVoid(bot, p, dragon) {
  const away = p.minus(dragon.position); away.y = 0;
  if (away.norm() < .01) return false;
  const u = away.unit(), fy = Math.floor(p.y);
  for (const n of [1, 2]) {
    const c = p.plus(u.scaled(n)).floored();
    let floor = false, loaded = true;
    for (let y = fy; y >= fy - DEEP; y--) {
      const b = bot.blockAt(new Vec3(c.x, y, c.z));
      if (!b) { loaded = false; break; }
      if (b.boundingBox === 'block') { floor = true; break; }
    }
    if (loaded && !floor) return true;
  }
  return false;
}

// The cells out of the breath where every cell has the void beside it (note
// 1404): out of the cloud first (its own radius, without the margin), then
// those a knock would not carry off into the void, then the fewest sides
// open to it, then the nearest. The dragon's blow and its breath's touch
// shove the body away from the dragon (note 1432): 25588 (dragon-16,
// 2026-10-13 07:18Z), out of the breath at the entry platform's corner
// (102.5, 49, 2.5), the void on five of its eight sides and on the far side
// from the dragon, was knocked off it by the next blow and fell out of the
// world. On a bridge the knock runs along it; at a corner, over the side.
// The island along the push from a point (note 1661): the cells from the point away from the dragon's centre, counted until one has no floor within DEEP below, up to CARRY.
const CARRY = 14;
function carryFloor(bot, p, dragon) {
  const away = p.minus(dragon.position); away.y = 0;
  if (away.norm() < .01) return CARRY;
  const u = away.unit(), fy = Math.floor(p.y);
  for (let n = 1; n <= CARRY; n++) {
    const c = p.plus(u.scaled(n)).floored();
    let floor = false, loaded = true;
    for (let y = fy + 2; y >= fy - DEEP; y--) {
      const b = bot.blockAt(new Vec3(c.x, y, c.z));
      if (!b) { loaded = false; break; }
      if (b.boundingBox === 'block') { floor = true; break; }
    }
    if (loaded && !floor) return n - 1;
  }
  return CARRY;
}

function cloudEdgeCells(bot, start, dragon, allowed = () => true) {
  const here = hazardDistance(start, dragon), out = cloudRadius(bot, dragon) - 2, feet = start.floored(), edge = [];
  const shover = Object.values(bot.entities || {}).find(e => e.name === 'ender_dragon' && e.isValid !== false) || dragon;
  // Two blocks farther from the cloud, or, where no cell is, one: on the
  // entry platform, five blocks square, the two-block gain left only the
  // corner.
  for (const gain of [2, 1]) {
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) for (const dy of [0, -1, 1]) {
      const p = feet.offset(dx, dy, dz).offset(.5, 0, .5), d = Math.hypot(dx, dz), h = hazardDistance(p, dragon);
      if (d < 2 || d > 10 || h < here + gain || !allowed(p) || !dryStanding(bot, p)) continue;
      edge.push({ p, d, inside: h <= out, knocked: knockedIntoVoid(bot, p, shover), sides: voidSides(bot, p) }); break;
    }
    if (edge.length) break;
  }
  return edge.sort((a, b) => a.inside - b.inside || a.knocked - b.knocked || a.sides - b.sides || a.d - b.d).slice(0, 4).map(e => e.p);
}

async function evadeOverTerrain(bot, task, goal, save, dragon, { allowed = () => true, walk = navigate } = {}) {
  const start = bot.entity.position.clone(), dimension = bot.game.dimension, toward = dragon.position.minus(start); toward.y = 0;
  const check = () => {
    task.check();
    if (bot.game.dimension !== dimension || bot.health <= 0 || bot.isAlive === false) throw new Error('Terrain evasion interrupted by death or dimension change');
  };
  check();
  const bearing = Math.atan2(toward.z, toward.x), candidates = [];
  for (const angle of dragon.name === 'area_effect_cloud' ? [Math.PI, Math.PI * .75, -Math.PI * .75, Math.PI / 2, -Math.PI / 2] : [Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * .75, -Math.PI * .75, Math.PI * .25, -Math.PI * .25]) {
    const direction = new Vec3(Math.cos(bearing + angle), 0, Math.sin(bearing + angle));
    for (const distance of [4, 6]) for (const dy of [0, -1, 1, -2, 2]) {
      const p = start.plus(direction.scaled(distance)).floored().offset(.5, dy, .5);
      if (allowed(p) && dryStanding(bot, p) && !deepBeside(bot, p)) { candidates.push(p); break; }
    }
  }
  // In the breath on a bridge or a ledge every cell has the void beside it,
  // and none of the above is taken (note 1404): the nearest cells farther
  // from the cloud, the void beside them or not, walked to and never run.
  // The breath is not stood in as a charge is (note 1153): it lies there. The
  // dragon stage of 2026-10-07 (25588, 20:25:19 to 20:25:27Z) stood on its
  // one-wide bridge from the entry platform in the dragon's breath, "No
  // surveyed walking escape" each step, and each touch of the breath
  // knocked it half a block on, 20 to 8 and over the side into the void.
  if (!candidates.length && dragon.name === 'area_effect_cloud') candidates.push(...cloudEdgeCells(bot, start, dragon, allowed));
  const movement = bot.pathfinder.movements;
  const previous = { canDig: movement.canDig, allowSprinting: movement.allowSprinting, maxDropDown: movement.maxDropDown,
    allow1by1towers: movement.allow1by1towers, scafoldingBlocks: movement.scafoldingBlocks };
  Object.assign(movement, { canDig: false, allowSprinting: true, maxDropDown: 1, allow1by1towers: false, scafoldingBlocks: [] });
  try {
    for (const p of candidates.slice(0, 8)) {
      check();
      if (fallDanger(bot)) return await recoverFall(bot, task, goal, save);
      if (bot.entity.onGround === false || bot.entity.position.distanceTo(start) > .75) return false;
      const destination = new goals.GoalBlock(Math.floor(p.x), p.y, Math.floor(p.z));
      const route = await surveyRoute(bot, task, movement, destination, 100);
      check();
      if (bot.entity.onGround === false || bot.entity.position.distanceTo(start) > .75) return false;
      if (route.status !== 'success' || route.path.some(n => n.toBreak?.length || n.toPlace?.length ||
        !allowed(new Vec3(n.x + .5, n.y, n.z + .5)))) continue;
      // Along a deadly edge it walks, not runs.
      movement.allowSprinting = !route.path.some(n => deepBeside(bot, new Vec3(n.x + .5, n.y, n.z + .5)));
      goal.step = { action: 'evade_dragon_over_terrain', from: { ...start }, destination: { ...p } }; save();
      try {
        // 1200 ms, not 3000 (note 1800): the walk over terrain under the dragon ran three seconds with no cover, and the body's hits land in it; 25588's dragon-171 (2026-10-18 00:01Z, one crystal) walked 4.5 blocks in 3.05 s, 14 to 6.4, dead a moment later; dragon-133 and 161 the same; five deaths carry it.
        await walk(bot, task, destination, { timeoutMs: 1200, stallMs: 800, stopWhen: () => fallDanger(bot) });
      } catch (err) {
        check();
        if (!fallDanger(bot)) {
          goal.endCombat.lastEvasionInterrupted = { at: Date.now(), reason: err.message }; save(); return false;
        }
      }
      check();
      if (fallDanger(bot)) await recoverFall(bot, task, goal, save);
      const evidence = { at: Date.now(), from: { ...start }, to: { ...bot.entity.position }, hazard: { id: dragon.id, name: dragon.name }, terrainRoute: true };
      goal.endCombat.lastEvasion = evidence; save(); bot.emit('end_combat', { evasion: evidence }); return true;
    }
    // One dodge with nowhere to go is a bad moment, not the end of the
    // fight: the next step looks again. As a Blocked error it ended the
    // rehearsal at full health with two crystals down.
    // No route the survey finds in its tenth of a second each (a hillside,
    // a pillar's foot): straight away from it at a run, over cells that
    // have a floor within two blocks under them all the way, as a player
    // runs out of the breath without a plan (note 1130). The rehearsal of
    // 2026-10-03 (23:02:09 to 23:02:22Z) stood on the island's slope in the
    // dragon's breath, "No surveyed walking escape" twelve times in a row,
    // 20 health to none without a step.
    const away = straightAway(bot, start, bearing, allowed) || straightAway(bot, start, bearing, allowed, 3, { rough: true });
    if (away) {
      goal.step = { action: 'evade_dragon_straight', from: { ...start }, toward: { x: away.x, y: away.y, z: away.z } }; save();
      try {
        await require('./motion').move(bot, { check, get cancelled() { return task.cancelled; }, label: task.label }, { label: 'evade_dragon_straight', keys: ['forward', 'sprint', 'jump'], sneak: false,
          why: 'out of the dragon\'s breath or its path at a run, over ground with a floor under every cell', look: away.offset(0, 1.6, 0), maxMs: 1500, tick: 50,
          until: () => bot.entity.position.distanceTo(start) >= RUN_BLOCKS - 1 || fallDanger(bot) });
      } catch (err) { check(); }
      if (fallDanger(bot)) await recoverFall(bot, task, goal, save);
      if (bot.entity.position.distanceTo(start) >= 2) {
        const evidence = { at: Date.now(), from: { ...start }, to: { ...bot.entity.position }, hazard: { id: dragon.id, name: dragon.name }, straightRun: true };
        goal.endCombat.lastEvasion = evidence; save(); bot.emit('end_combat', { evasion: evidence }); return true;
      }
    }
    throw Object.assign(new Error('No surveyed walking escape from the dragon on loaded terrain'), { name: 'NoEscape' });
  } finally { bot.pathfinder.setGoal(null); bot.clearControlStates(); Object.assign(movement, previous); }
}

// Where the evasion's time went, said when it took over 600 ms or the breath is still on the body (note 1765): 25588's dragon-117 (2026-10-17 13:27Z) set evade_breath_straight in a fireball's cloud and wrote nothing for 6.8 s to its death at (-27, 62, 28), 92 blocks and a pickaxe carried; the arena (14:23Z) answered the same cloud in 12 ms with two blocks up.
async function evadeDragon(bot, task, goal, save, opts = {}) {
  const t0 = Date.now(), p0 = bot.entity.position.clone(), h0 = bot.health;
  try { return await evadeDragonInner(bot, task, goal, save, opts); }
  finally {
    const ms = Date.now() - t0, breath = breathThreat(bot);
    if (ms > 600 || breath) console.log(`[end safety] the evasion took ${ms} ms: step ${goal?.step?.action || '-'}, moved ${Math.round(bot.entity.position.distanceTo(p0) * 10) / 10} blocks to ${bot.entity.position.floored()}, ${Number(h0).toFixed(1)} to ${Number(bot.health).toFixed(1)} health, breath ${breath ? `${breath.name} ${Math.round(hazardDistance(bot.entity.position, breath) * 10) / 10} off` : 'none'}, on ground ${bot.entity.onGround}`);
  }
}
async function evadeDragonInner(bot, task, goal, save, { allowed, timeoutMs = 1600, dig = null } = {}) {
  task.check();
  const dimension = bot.game.dimension;
  bot.pathfinder.setGoal(null); bot.clearControlStates(); bot.stopDigging?.();
  const check = () => {
    task.check();
    if (bot.game.dimension !== dimension || bot.health <= 0 || bot.isAlive === false) throw new Error('Dragon evasion interrupted by death or dimension change');
  };
  try {
    // Even a small wing hit briefly lifts the feet off the ground. Surveying
    // that fractional Y as a standing level falsely reports a terrain trap.
    // Let ordinary physics land small hops; escalating launches immediately
    // hand over to the water recovery instead of waiting for impact.
    const landingDeadline = Date.now() + 2000;
    while (bot.entity.onGround === false) {
      check();
      if (fallDanger(bot)) return await recoverFall(bot, task, goal, save);
      if (Date.now() >= landingDeadline) {
        goal.step = { action: 'await_knockback_landing', position: { ...bot.entity.position } }; save(); return false;
      }
      await sleep(10);
    }
    const dragon = breathThreat(bot) || dragonThreat(bot);
    // One run a fireball (note 1475): the ball is aimed at where the bot
    // stood when it was thrown, and a run begun again each tick from the
    // ball's moving position went back and forth over the same two cells.
    // 25588 (dragon-56, 2026-10-13 14:39Z, full iron) ran three times in a
    // second and a half, 41.8 to 43.3 to 41.4, the cloud landed on it and
    // it died in it. Run once, then stand where the run ended.
    if (dragon?.name === 'dragon_fireball') {
      const last = goal.endCombat?.lastEvasion;
      // Only after a run that went somewhere (note 1497): four blocks or more
      // from where it began, out of the cloud's reach. 25588 (dragon-70,
      // 2026-10-13 18:00Z, eight crystals broken, 4.9 health, no food left)
      // ran 1.8 blocks from a fireball, stood where the run ended, and the
      // ball's cloud took it there.
      const ran = last?.from && last?.to ? Math.hypot(last.to.x - last.from.x, last.to.z - last.from.z) : 0;
      if (last?.straightRun && last.hazard?.name === 'dragon_fireball' && Date.now() - last.at < 2500 && ran >= 4) {
        goal.step = { action: 'stand_after_fireball_run', since: last.at, ran: Math.round(ran * 10) / 10 }; save();
        await sleep(200); return true;
      }
    }
    if (!dragon) return false;
    // In the breath, or with a fireball coming, straight out first at a run
    // over any ground with a floor (straightAway), the surveys only where no
    // straight run is to be had (note 1423): the cloud takes 6 a second, and
    // the dodge's checked line failed on the island's rough low ground east
    // while the surveys took their tenth of a second each. 25588 (dragon-10,
    // 2026-10-13 06:17Z, full iron, two water buckets) went 20 to none in
    // three seconds there, as dragon-6, -7 and -9 had before it.
    // One block up out of a cloud at the feet, before any run (note 1893): the cloud's box is half a block high (note 1889's drill), so a block placed under the feet takes the body clear of it in a jump, about four tenths of a second; the runs from it on rough ground stalled. 25588's dragon-253 (2026-10-19 03:2xZ, two crystals) at (-2, 57, 30) with the cloud 0.7 off at its feet's level ran 0.9 and 0.5 blocks, 19.6 to 13.6 to 7.6, dead; dragon-252, 251 and 247 the same. Not with a fireball in flight within fourteen (it would burst on the new block's top), nor with a block over the head.
    if (dragon.name === 'area_effect_cloud' && Math.abs(dragon.position.y - bot.entity.position.y) <= 0.5 && bot.entity.onGround) {
      const f = bot.entity.position.floored(), pr = require('./pillar-recovery');
      const items = bot.inventory?.items?.() || [], carried = pr.SCAFFOLD.reduce((n, k) => n + items.filter(i => i.name === k).reduce((m, i) => m + i.count, 0), 0);
      // Two over the head clear, not three (note 2204): a block three over stops the second block, not the first; the jump rises a block and a fifth under it and the one block goes under the feet.
      const headClear = bot.blockAt(f.offset(0, 2, 0))?.boundingBox !== 'block';
      const ballNear = Object.values(bot.entities).some(e => e.name === 'dragon_fireball' && e.isValid !== false && e.position.distanceTo(bot.entity.position) < 14);
      // The water at the feet taken up first (note 1902): a jump from water does not reach a block's top, and the one up, the stub and the climb were all refused in the bot's own pool. 25588's dragon-274 (2026-10-19 09:3xZ) in its pool's pit at (-10, 62, -38) under a cloud: 'one block up ... not up', 'water at the feet', 'no straight run ... from a pit', 10 to none. A source at the feet goes back into an empty bucket.
      if (carried >= 1 && headClear && !ballNear && /water/.test(bot.blockAt(f)?.name || '') && items.some(i => i.name === 'bucket')) {
        const t1 = Date.now();
        try { await require('./water').fillWaterBucket(bot, task, f, { timeoutMs: 1200 }); } catch (_) { /* left */ }
        for (let i = 0; i < 10 && /water/.test(bot.blockAt(f)?.name || ''); i++) await new Promise(r => setTimeout(r, 50));
        console.log(`[end safety] the water at the feet at ${f} taken up before the one block up: ${/water/.test(bot.blockAt(f)?.name || '') ? 'still wet' : 'dry'} in ${Date.now() - t1} ms`);
      }
      // Why the one up is not taken, said (note 2215): dragon-316 (25592, 2026-10-26 13:35 to 13:44Z) climbed one block out of
      // a cloud four times at (49, 57, -1), 0.4 s each and nothing lost, and the fifth cloud at the same cell took it 20 to none
      // with no line between; the gate's three refusals (no block carried, a block two over the head, a fireball within 14) were silent.
      if (!(carried >= 1 && headClear && !ballNear) && !(bot._oneUpRefusedSaid > Date.now() - 3000)) {
        bot._oneUpRefusedSaid = Date.now();
        console.log(`[end safety] no block up out of the cloud at ${f}: ${[carried < 1 ? 'no block carried' : null, !headClear ? `a block two over the head (${bot.blockAt(f.offset(0, 2, 0))?.name})` : null, ballNear ? 'a fireball within 14' : null].filter(Boolean).join(', ')}; ${bot.health.toFixed(1)} health`);
      }
      if (carried >= 1 && headClear && !ballNear) {
        const h0 = bot.health, t0 = Date.now();
        goal.step = { action: 'one_up_out_of_the_cloud', health: bot.health }; save();
        try { await pr.pillarUp(bot, task, f.y + 1, { dig, maxBlocks: 1, threats: false, wet: true }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
        const up = Math.floor(bot.entity.position.y) - f.y;
        console.log(`[end safety] one block up out of the cloud at ${f}: ${up >= 1 ? `up at ${bot.entity.position.floored()}` : 'not up'} in ${Date.now() - t0} ms, ${h0.toFixed(1)} to ${bot.health.toFixed(1)} health`);
        if (up >= 1) return { oneUp: true };
      }
    }
    // No straight run from a pit in the cloud (note 1891, the reflex's half of note 1890): the run meets the wall, and 25588's dragon-247 (2026-10-19 02:2xZ) in its pit at (5, 56, 41) ran 0.4 blocks in 1.6 s, 15.8 to 4.0; one block up is clear of the cloud (note 1889's drill), and the stub is the combat's answer to no escape.
    if (dragon.name === 'area_effect_cloud') {
      const f = bot.entity.position.floored(), walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => bot.blockAt(f.offset(dx, 1, dz))?.boundingBox === 'block').length;
      if (walls >= 2) throw Object.assign(new Error(`No straight run out of the cloud from a pit at ${f}: ${walls} walls at the head's height`), { name: 'NoEscape' });
    }
    if (['area_effect_cloud', 'dragon_fireball'].includes(dragon.name)) {
      const start = bot.entity.position.clone(), toward = dragon.position.minus(start); toward.y = 0;
      const bearing = Math.atan2(toward.z, toward.x);
      // Six cells, else three, else two (note 1430): on the island's rough
      // eastern ground, the void near, no six-cell run was to be had, and
      // 25588 (dragon-14, 2026-10-13 07:06Z, full iron) stood in the cloud
      // 'no surveyed walking escape' three seconds, 20 to 2. A short step out
      // and the next tick's step again beat standing.
      // Out of the fireball's line, not along it (note 1892): the ball flies straight at where the body stood and bursts there, its cloud three or more across, and the run straight away from it stays in its line. Of the fireball bursts on the body in 25588's dragon-239 to 249 (2026-10-19), eleven came after a run of 1 to 2.4 blocks, ended early as the ball stopped reading as aimed at the body, and seven of those lives ended there. Sideways first for a ball, and the run goes on to four blocks whatever the ball reads.
      const ball = dragon.name === 'dragon_fireball';
      const angles = ball ? [Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI] : undefined;
      let runBlocks = RUN_BLOCKS;
      let away = straightAway(bot, start, bearing, allowed || (() => true), runBlocks, { angles });
      // A ball's run takes a rough lane of four, a block up a cell with the jump held, before a smooth lane of three (note 1894): by the pillars the ground is the bot's own pits and trenches, and 25588's dragon-254 (2026-10-19 03:3xZ) found only lanes of two and three there, 'toward 2.0 blocks', and took the burst three times of four.
      let rough = false;
      if (!away) { runBlocks = 4; away = straightAway(bot, start, bearing, allowed || (() => true), runBlocks, { angles }); }
      if (!away && ball) { away = straightAway(bot, start, bearing, allowed || (() => true), 4, { angles, rough: true }); if (away) { runBlocks = 4; rough = true; } }
      if (!away) { runBlocks = 3; away = straightAway(bot, start, bearing, allowed || (() => true), runBlocks, { angles }); }
      if (!away) { runBlocks = 2; away = straightAway(bot, start, bearing, allowed || (() => true), runBlocks, { angles }) || straightAway(bot, start, bearing, allowed || (() => true), runBlocks, { rough: true, angles }); }
      // No run that ends in the cloud's box (note 1896): a run out of a cloud a block or two down a slope stood the body where its box still met the cloud's, and 25588's dragon-259 (2026-10-19 04:46Z, two crystals) ran 'moved 1.2 blocks to (-10, 60, -35)' from (-10, 61, -35) with the cloud at 61, 12.3 to 0.3. A lane whose end lies within the cloud's radius with the feet from 1.8 under its height to half a block over it is no lane (the box of note 1889's drill); the stub is the answer then.
      if (away && dragon.name === 'area_effect_cloud' && Math.hypot(away.x - dragon.position.x, away.z - dragon.position.z) <= cloudRadius(bot, dragon) + 0.3 && away.y - dragon.position.y < 0.5 && dragon.position.y - away.y < 1.8) {
        console.log(`[end safety] no run out of the cloud to (${Math.floor(away.x)}, ${Math.floor(away.y)}, ${Math.floor(away.z)}): its end is still in the cloud's box (the cloud at ${dragon.position.y.toFixed(1)}, ${Math.round(cloudRadius(bot, dragon) * 10) / 10} wide)`);
        away = null;
      }
      if (away) {
        goal.step = { action: 'evade_breath_straight', hazard: dragon.name, from: { ...start }, toward: { x: away.x, y: away.y, z: away.z } }; save();
        // No jump, and the floor a step ahead read each tick (note 1428): at a
        // sprint and a jump the run went two cells past the six it had checked,
        // over the island's eastern edge, and 25588 (dragon-12, 2026-10-13
        // 06:37Z) fell out of the world at full health.
        const dir = away.minus(start); dir.y = 0; const unit = dir.scaled(1 / (dir.norm() || 1));
        const floorAhead = () => { const n = bot.entity.position.plus(unit.scaled(0.9)); const f = n.floored(); return [0, -1, -2].some(dy => bot.blockAt(f.offset(0, dy - 1, 0))?.boundingBox === 'block') && !deepBeside(bot, n); };
        // The run that stalls is given up in half a second and taken again with a jump (note 1882): against a pit's or a quarry's wall the body ran in place, 'moved 0.4 blocks' in 1.8 s with the fireball's cloud on it, in 25588's dragon-226 (2026-10-18 17:58Z, 14 to 2) and dragon-229 (18:26Z, 16.9 to 10.9), a tick of six for every second against the wall. The jump takes a block's ledge; a wall two high ends the run, and the stub or the hole is next.
        const t0 = Date.now(); let stalled = false;
        try {
          await move(bot, { check, get cancelled() { return task.cancelled; }, label: task.label }, { label: 'evade_breath_straight', keys: rough ? ['forward', 'sprint', 'jump'] : ['forward', 'sprint'], sneak: false,
            why: 'straight out of the dragon\'s breath at a run', look: away.offset(0, 1.6, 0), maxMs: 1800, tick: 25,
            until: () => bot.entity.position.distanceTo(start) >= Math.max(1.5, ball ? Math.min(4, runBlocks) : runBlocks - 1) || fallDanger(bot) || (!breathThreat(bot) && (!ball || bot.entity.position.distanceTo(start) >= Math.min(4, runBlocks))) || !floorAhead() || (stalled = Date.now() - t0 > 500 && bot.entity.position.distanceTo(start) < 0.5) });
        } catch (err) { check(); }
        if (stalled && breathThreat(bot) && !fallDanger(bot)) {
          const s0 = bot.entity.position.clone();
          try {
            await move(bot, { check, get cancelled() { return task.cancelled; }, label: task.label }, { label: 'evade_breath_straight_jump', keys: ['forward', 'sprint', 'jump'], sneak: false,
              why: 'the run stalled against a ledge: the same way with a jump', look: away.offset(0, 1.6, 0), maxMs: 900, tick: 25,
              until: () => bot.entity.position.distanceTo(start) >= Math.max(1.5, runBlocks - 1) || fallDanger(bot) || !breathThreat(bot) || !floorAhead() });
          } catch (err) { check(); }
          console.log(`[end safety] the straight run stalled at ${s0.floored()} (${Math.round(s0.distanceTo(start) * 10) / 10} moved in half a second): taken again with a jump, now at ${bot.entity.position.floored()}, ${Math.round(bot.entity.position.distanceTo(start) * 10) / 10} from the start`);
        }
        if (fallDanger(bot)) await recoverFall(bot, task, goal, save);
        if (bot.entity.position.distanceTo(start) >= 1.2) {
          const evidence = { at: Date.now(), from: { ...start }, to: { ...bot.entity.position }, hazard: { id: dragon.id, name: dragon.name }, straightRun: true, blocks: runBlocks };
          goal.endCombat.lastEvasion = evidence; save(); bot.emit('end_combat', { evasion: evidence }); return true;
        }
      }
    }
    let route = dodgeRoutes(bot, dragon, allowed)[0];
    // The run from the dragon's body chosen by the island beyond it along the push (note 1661): the body struck is shoved away from the dragon's centre and carried along its flight, 14 blocks (dragon-194) to 70 (dragon-189), and a run that ends by the rim ends in the void. Of the 30 runs 167 to 196 five died on the ground within seconds of the charge's call: 25588 (dragon-195, 2026-10-14 19:13Z) was cut at (-5, 61, -43), ran eight blocks north to the rim unsaid, took two blows at (-7, 61, -51) and went over the edge into the void; dragon-189 (17:53Z) at the fountain was carried 75 blocks into the void; dragon-181 (16:22Z) carried off the fountain's ground and dropped; dragon-176 and 180 the same. Among the routes with two blocks or more, the one with the most island along the push from its end is taken, and the run is said in the log.
    if (dragon.name === 'ender_dragon') {
      // The hole before the run (note 1667): a run of three to six blocks aside stays under the wings, which reach ten aside (the drill of note 1414), and the body's call comes again and again while the dragon is about; a hole two deep is untouched by it (note 1616's drill). 25588 (dragon-202, 2026-10-14 20:53Z, five crystals broken, 1665 live) ran 'west 3.6 blocks' and 'east 3.6 blocks' seven times over in twenty seconds at (-14, 60, 34), was struck twice and carried 70 blocks west to (-84, 47), dead of the fall; dragon-200 (20:27Z) crouched ten times and died the same. On thick ground clear of the void and water, a block is dug under the feet at each call until the hole is two deep; the run is for ground that cannot be dug.
      {
        const f = bot.entity.position.floored();
        const solid = c => bot.blockAt(c)?.boundingBox === 'block';
        const sidesClosed = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => solid(f.offset(dx, 0, dz)) && solid(f.offset(dx, 1, dz))).length;
        const thick = [1, 2, 3, 4, 5, 6].every(dy => solid(f.offset(0, -dy, 0)));
        const wet = /water/.test(bot.blockAt(f)?.name || '') || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => /water/.test(bot.blockAt(f.offset(dx, 0, dz))?.name || '') || /water/.test(bot.blockAt(f.offset(dx, -1, dz))?.name || ''));
        // Ground, not a stub's top (note 1698, as note 1697 in end combat): 25588 (dragon-235, 2026-10-15 05:1xZ) dug 'hole_for_the_body' on a stub top at (10, 65, 10), 'no column', and fell at 13.6 health. Two of the four cells beside the feet must have ground one under the feet.
        const groundBeside = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => solid(f.offset(dx, -1, dz))).length;
        // Under the open sky only (note 1751): with stone over the head the body is underground already, out of the dragon's sight and reach, and the dig here took it a block deeper at every pass. 25588's dragon-20 of the new save (2026-10-15 23:05Z to 10-16 03:4xZ, two crystals broken) was dug down so to y 17 under the island and held there four hours, the staircase up (note 1747) undone a block at a time.
        const openSky = [2, 3, 4, 5, 6, 7, 8].every(dy => !solid(f.offset(0, dy, 0)));
        if (dig && thick && !wet && groundBeside >= 2 && voidSides(bot, bot.entity.position) === 0 && !deepBeside(bot, bot.entity.position) && bot.entity.onGround && !cloudBelow(bot)) {
          // The roof first on going back into the hole (note 1847): a hole open at the top is a fireball's cup, and 25588's dragon-208 (2026-10-18 12:11Z, one crystal) went back into its hole at (3, 58, 11) for the dragon's body, sat three seconds under the open sky, and the fireball thrown nine seconds before came in over it before the roof went on: 20 to 14 to 8 to none in the hole. The roof is end combat's (handed over on bot._roofOverhead); half a second, laid before the crouch.
          if (sidesClosed >= 4) { if (openSky && bot._roofOverhead) { try { const r = await bot._roofOverhead(); console.log(`[end safety] in the hole for the body at ${f}: the roof ${r ? 'laid' : 'not laid'} first`); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } } bot.setControlState?.('sneak', true); goal.step = { action: 'in_the_hole_for_the_body', hazard: dragon.name }; save(); await sleep(400); bot.setControlState?.('sneak', false); return true; }
          if (!openSky) { bot.setControlState?.('sneak', true); goal.step = { action: 'under_the_stone_for_the_body', hazard: dragon.name }; save(); await sleep(400); bot.setControlState?.('sneak', false); return true; }
          // No hole dug by hand (note 1763): end stone by hand is fifteen seconds a block, the body standing still in the open the while, and the cloud that lands on it is not answered until the dig ends. 25588's dragon-113 (2026-10-17 12:59Z, two crystals broken) and dragon-118 (13:46Z, four broken) had worn their pickaxes out, stood 14 and 20 seconds a block over this dig in a pit one deep, and died in the fireball's cloud at the second block, nine iron ingots and a crafting table carried. With no pickaxe the run is taken.
          const pickaxe = (bot.inventory?.items?.() || []).some(i => /_pickaxe$/.test(i.name));
          if (!pickaxe) {
            if (!(bot._noPickHoleSaid > Date.now() - 20000)) { bot._noPickHoleSaid = Date.now(); console.log(`[end safety] the dragon's body coming and no pickaxe carried: no hole dug by hand at ${f} (end stone is fifteen seconds a block bare-handed, the body still in the open the while); the run instead`); }
          } else {
          goal.step = { action: 'hole_for_the_body', hazard: dragon.name, sidesClosed }; save();
          console.log(`[end safety] the dragon's body coming: a block dug under the feet at ${f} toward a hole two deep (${sidesClosed} of 4 sides closed now), not a run under the wings`);
          // Both blocks in the one call (note 1699, as note 1681 for the hole before the pass): a block a call left the body one deep when the blow came. 25588 (dragon-235, 2026-10-15 05:24Z, four crystals broken) dug one at (-33, 63, -4), the next call dug the second, and between them two blows of the body took 10.5 to 5.1 at (-32.5, 62, -3.5).
          for (let n = 0; n < 2; n++) {
            const g = bot.entity.position.floored();
            if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => solid(g.offset(dx, 0, dz)) && solid(g.offset(dx, 1, dz))).length >= 4) break;
            if (!solid(g.offset(0, -1, 0)) || !solid(g.offset(0, -2, 0))) break;
            try { await dig(bot, task, g.offset(0, -1, 0), { dropInto: true, openPit: true, requireDrops: false }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; break; }
            for (let i = 0; i < 20 && !bot.entity.onGround; i++) await sleep(50);
          }
          // The roof on the hole just dug (note 1852, as note 1847 for the hole gone back into): the two blocks take three or four seconds and the hole is a fireball's cup until it is lidded; 25588's dragon-211 (2026-10-18 12:49Z) dug 'toward a hole two deep' at (30, 61, 19), took the fireball's cloud in it, 14 to 9 to none, 'clouds 0.4 off, 1.9 up'.
          if (bot._roofOverhead) { try { const r = await bot._roofOverhead(); console.log(`[end safety] the hole for the body at ${bot.entity.position.floored()}: the roof ${r ? 'laid' : 'not laid'}`); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } }
          bot.setControlState?.('sneak', true); await sleep(150); bot.setControlState?.('sneak', false);
          return true;
          }
        }
      }
      const routes = dodgeRoutes(bot, dragon, allowed).map(r => ({ ...r, floor: carryFloor(bot, r.destination, dragon) }));
      const here = carryFloor(bot, bot.entity.position, dragon);
      routes.sort((a, b) => (Math.min(b.floor, CARRY) - Math.min(a.floor, CARRY)) || (b.distance - a.distance));
      route = routes[0] || null;
      const dirName = r => { const d = r.direction; return Math.abs(d.x) >= Math.abs(d.z) ? (d.x > 0 ? 'east' : 'west') : (d.z > 0 ? 'south' : 'north'); };
      // The run is kept when it has eight blocks of island or as much as here (note 1663): a sideways run out of the dragon's line is worth more than a block of island; dragon-198 (19:48Z) stood for a 7-block run with 13 against 14.
      if (route && route.floor < 8 && route.floor < here) { console.log(`[end safety] the dragon's body coming: no run with more island beyond it along the push than here (${here} blocks); the best, ${dirName(route)} ${Math.round(route.distance * 10) / 10} blocks, has ${route.floor}; the body stays and crouches`); route = null; }
      else if (route) console.log(`[end safety] the dragon's body coming: the run ${dirName(route)} ${Math.round(route.distance * 10) / 10} blocks to (${Math.round(route.destination.x)}, ${Math.round(route.destination.z)}), ${route.floor >= CARRY ? `${CARRY} or more` : route.floor} blocks of island beyond it along the push (here ${here >= CARRY ? `${CARRY} or more` : here})`);
      else console.log(`[end safety] the dragon's body coming: no run of two blocks from ${bot.entity.position.floored()}; ${here >= CARRY ? 'the island holds' : `${here} blocks of island along the push`} here`);
      // No run: the hole dug under the feet (note 1665): a hole two deep is untouched by the body (the drill of note 1616), and the call of the body comes again and again while the dragon is about. 25588 (dragon-200, 2026-10-14 20:26 to 20:27Z, four crystals broken) stood in its quarry's pit at (-32, 61, -21) at 6.9 health, 'no run of two blocks' ten times in eighty seconds, crouched each time and quarried between, and two blows of the body took 6.9 to none. On thick ground with no void within four the body digs under its feet, one block a call, to a hole two deep, and crouches in it.
      if (!route) {
        const f = bot.entity.position.floored();
        const solid = c => bot.blockAt(c)?.boundingBox === 'block';
        const sidesClosed = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => solid(f.offset(dx, 0, dz)) && solid(f.offset(dx, 1, dz))).length;
        const thick = [1, 2, 3, 4, 5, 6].every(dy => solid(f.offset(0, -dy, 0)));
        // No hand dig here either (note 1779, as note 1763 for the other branch): 25588's dragon-149 (2026-10-17 18:2xZ) with its pickaxe worn out took 16 and 11 s over this dig.
        const pickaxe2 = (bot.inventory?.items?.() || []).some(i => /_pickaxe$/.test(i.name));
        if (dig && pickaxe2 && sidesClosed < 4 && thick && voidSides(bot, bot.entity.position) === 0 && !deepBeside(bot, bot.entity.position) && bot.entity.onGround && !cloudBelow(bot)) {
          goal.step = { action: 'hole_for_the_body', hazard: dragon.name, sidesClosed }; save();
          console.log(`[end safety] the dragon's body coming: no run; a block dug under the feet at ${f} toward a hole two deep (${sidesClosed} of 4 sides closed now)`);
          try { await dig(bot, task, f.offset(0, -1, 0), { dropInto: true, openPit: true, requireDrops: false }); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
          for (let i = 0; i < 20 && !bot.entity.onGround; i++) await sleep(50);
          // The roof on the hole just dug (note 1852, as note 1847 for the hole gone back into): the two blocks take three or four seconds and the hole is a fireball's cup until it is lidded; 25588's dragon-211 (2026-10-18 12:49Z) dug 'toward a hole two deep' at (30, 61, 19), took the fireball's cloud in it, 14 to 9 to none, 'clouds 0.4 off, 1.9 up'.
          if (bot._roofOverhead) { try { const r = await bot._roofOverhead(); console.log(`[end safety] the hole for the body at ${bot.entity.position.floored()}: the roof ${r ? 'laid' : 'not laid'}`); } catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; } }
          bot.setControlState?.('sneak', true); await sleep(200); bot.setControlState?.('sneak', false);
          return true;
        }
        // Why no hole, said (note 1768): 43 times on 25588 (2026-10-16/17) the body's call found no run and the crouch was taken, and nine of them were followed by the throw (dragon-131, 15:1xZ: from (-30, 68, 27) 17.8 blocks through the air, dead of the fall); the crouch stops nothing, and nothing said which of the hole's conditions failed.
        if (!(bot._noHoleSaid > Date.now() - 10000)) { bot._noHoleSaid = Date.now(); const why = [!dig && 'no dig', sidesClosed >= 4 && 'walled already', !thick && `ground ${[1, 2, 3, 4, 5, 6].findIndex(dy => !solid(f.offset(0, -dy, 0))) + 1} thick`, voidSides(bot, bot.entity.position) !== 0 && 'the void beside', deepBeside(bot, bot.entity.position) && 'a drop beside', !bot.entity.onGround && 'in the air'].filter(Boolean).join(', '); console.log(`[end safety] the dragon's body coming: no run and no hole at ${f} (${why || 'no reason found'}): the crouch, which stops nothing`); }
        bot.setControlState?.('sneak', true); goal.step = { action: 'crouch_for_the_body', hazard: dragon.name, islandAlongThePush: here, sidesClosed }; save(); await sleep(400); bot.setControlState?.('sneak', false); return true;
      }
    }
    if (!route) return await evadeOverTerrain(bot, task, goal, save, dragon, { allowed });
    const start = bot.entity.position.clone();
    // use normal movement packets, never position edits
    await bot.look(Math.atan2(-route.direction.x, -route.direction.z), 0, true); check();
    goal.step = { action: 'evade_dragon', hazard: dragon.name, from: { ...start }, destination: { ...route.destination } }; save();
    // Each step ahead is checked before it is taken; the run stops at the
    // first cell that is not dry, allowed ground, or at any sign of a fall.
    const stepOk = () => { const next = bot.entity.position.plus(route.direction.scaled(.8));
      return !(allowed && !allowed(next)) && [-.3, .3].every(x => [-.3, .3].every(z => dryStanding(bot, next.offset(x, 0, z)))); };
    await move(bot, { check }, { label: 'evade_dragon', keys: ['forward', 'sprint'], sneak: false, why: 'sprinting from the dragon along a checked route',
      maxMs: timeoutMs, until: () => bot.entity.position.distanceTo(start) >= route.distance - .7 || fallDanger(bot) || !stepOk() });
    if (fallDanger(bot)) await recoverFall(bot, task, goal, save);
    check();
    if (bot.entity.position.distanceTo(start) < .2) {
      bot.clearControlStates();
      return await evadeOverTerrain(bot, task, goal, save, dragon, { allowed });
    }
    const evidence = { at: Date.now(), from: { ...start }, to: { ...bot.entity.position }, hazard: { id: dragon.id, name: dragon.name } };
    goal.endCombat.lastEvasion = evidence; save(); bot.emit('end_combat', { evasion: evidence });
    return true;
  } finally { bot.clearControlStates(); }
}
module.exports = { deepBeside, voidSides, knockedIntoVoid, carryFloor, CARRY, fireballNear, cloudEdgeCells, straightAway, cloudRadius, hazardDistance, breathThreat, dragonThreat, endEmergency, checkEndEmergency, dodgeRoutes, evadeOverTerrain, evadeDragon };
