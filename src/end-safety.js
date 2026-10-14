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
function hazardDistance(point, entity) {
  if (entity.name !== 'area_effect_cloud') return point.distanceTo(entity.position);
  // Two deep in a hole the body's top (1.8 over the feet) is under the cloud's floor (note 1619): read as in it at exactly two under, the sword from the hole (note 1618) would be cut by its own cloud.
  if (point.y - entity.position.y > 1.2 || entity.position.y - point.y > 1.8) return Infinity;
  return Math.hypot(point.x - entity.position.x, point.z - entity.position.z);
}
function breathThreat(bot) {
  const entities = Object.values(bot.entities).filter(e => e.isValid !== false);
  return entities.find(e => e.name === 'area_effect_cloud' && hazardDistance(bot.entity.position, e) <= cloudRadius(bot, e)) ||
    entities.find(e => e.name === 'dragon_fireball' && e.position.distanceTo(bot.entity.position) < 48); // 48, not 18 (note 1469): the roof wants the ball seen while it is still far; at 18 it was a second off, and 25588 (dragon-51, 2026-10-13 13:44Z) took the cloud at its feet on the climb, 20 to 2 in two seconds.
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
    return phase === 8 && distance < 72 && height > -12 && height < 32 ||
      distance < 18 && height > -6 && height < 14;
  });
}
function endEmergency(bot) {
  if (fallDanger(bot)) return 'dangerous_fall';
  const breath = breathThreat(bot);
  if (breath) return breath.name === 'area_effect_cloud' ? 'dragon_breath_cloud' : 'incoming_dragon_fireball';
  if (dragonThreat(bot)) return 'dragon_charge_or_contact';
  return null;
}
function checkEndEmergency(bot) {
  const reason = endEmergency(bot);
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
function straightAway(bot, start, bearing, allowed = () => true, blocks = RUN_BLOCKS, { rough = false } = {}) {
  const solid = (x, y, z) => bot.blockAt(new Vec3(x, y, z))?.boundingBox === 'block';
  const feet = Math.floor(start.y);
  for (const angle of [Math.PI, Math.PI * .75, -Math.PI * .75, Math.PI / 2, -Math.PI / 2]) {
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
        await walk(bot, task, destination, { timeoutMs: 3000, stallMs: 1000, stopWhen: () => fallDanger(bot) });
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

async function evadeDragon(bot, task, goal, save, { allowed, timeoutMs = 1600 } = {}) {
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
    if (['area_effect_cloud', 'dragon_fireball'].includes(dragon.name)) {
      const start = bot.entity.position.clone(), toward = dragon.position.minus(start); toward.y = 0;
      const bearing = Math.atan2(toward.z, toward.x);
      // Six cells, else three, else two (note 1430): on the island's rough
      // eastern ground, the void near, no six-cell run was to be had, and
      // 25588 (dragon-14, 2026-10-13 07:06Z, full iron) stood in the cloud
      // 'no surveyed walking escape' three seconds, 20 to 2. A short step out
      // and the next tick's step again beat standing.
      let runBlocks = RUN_BLOCKS;
      let away = straightAway(bot, start, bearing, allowed || (() => true), runBlocks);
      if (!away) { runBlocks = 3; away = straightAway(bot, start, bearing, allowed || (() => true), runBlocks); }
      if (!away) { runBlocks = 2; away = straightAway(bot, start, bearing, allowed || (() => true), runBlocks) || straightAway(bot, start, bearing, allowed || (() => true), runBlocks, { rough: true }); }
      if (away) {
        goal.step = { action: 'evade_breath_straight', hazard: dragon.name, from: { ...start }, toward: { x: away.x, y: away.y, z: away.z } }; save();
        // No jump, and the floor a step ahead read each tick (note 1428): at a
        // sprint and a jump the run went two cells past the six it had checked,
        // over the island's eastern edge, and 25588 (dragon-12, 2026-10-13
        // 06:37Z) fell out of the world at full health.
        const dir = away.minus(start); dir.y = 0; const unit = dir.scaled(1 / (dir.norm() || 1));
        const floorAhead = () => { const n = bot.entity.position.plus(unit.scaled(0.9)); const f = n.floored(); return [0, -1, -2].some(dy => bot.blockAt(f.offset(0, dy - 1, 0))?.boundingBox === 'block') && !deepBeside(bot, n); };
        try {
          await move(bot, { check, get cancelled() { return task.cancelled; }, label: task.label }, { label: 'evade_breath_straight', keys: ['forward', 'sprint'], sneak: false,
            why: 'straight out of the dragon\'s breath at a run', look: away.offset(0, 1.6, 0), maxMs: 1800, tick: 25,
            until: () => bot.entity.position.distanceTo(start) >= Math.max(1.5, runBlocks - 1) || fallDanger(bot) || !breathThreat(bot) || !floorAhead() });
        } catch (err) { check(); }
        if (fallDanger(bot)) await recoverFall(bot, task, goal, save);
        if (bot.entity.position.distanceTo(start) >= 1.2) {
          const evidence = { at: Date.now(), from: { ...start }, to: { ...bot.entity.position }, hazard: { id: dragon.id, name: dragon.name }, straightRun: true, blocks: runBlocks };
          goal.endCombat.lastEvasion = evidence; save(); bot.emit('end_combat', { evasion: evidence }); return true;
        }
      }
    }
    const route = dodgeRoutes(bot, dragon, allowed)[0];
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
module.exports = { deepBeside, voidSides, knockedIntoVoid, cloudEdgeCells, straightAway, cloudRadius, hazardDistance, breathThreat, dragonThreat, endEmergency, checkEndEmergency, dodgeRoutes, evadeOverTerrain, evadeDragon };
