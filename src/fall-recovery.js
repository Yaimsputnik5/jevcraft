'use strict';
const { Vec3 } = require('vec3');
const { countOf } = require('./skills');
const { fillWaterBucket } = require('./water');
const { dryStanding } = require('./mining-access');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const down = new Vec3(0, -1, 0);

function fallDanger(bot) {
  const e = bot.entity;
  if (!e || e.onGround !== false || e.isInWater || e.isInLava || !e.velocity) return false;
  if (e.velocity.y > .6) return true;
  if (e.velocity.y >= -.2) return false;
  const hit = bot.world.raycast(e.position.offset(0, .1, 0), down, 4);
  return !hit || e.velocity.y < -.9;
}

// Physics emits this tick after prediction and before the position packet.
// Use the previous transmitted position for server reach/aim, and the current
// predicted landing column for the destination. No distant water placement,
// client-only fluid or position edits are used.
// Why no water went down is kept on the bot (note 1498), the last reasons
// by tick, for the dry landing's log: 25588 (dragon-71, 2026-10-13 18:04Z)
// stepped off its column with the bucket in hand, 22 blocks, and landed dry,
// 20 to 3.9, with no word of what the clutch saw on the way down.
function clutchTarget(bot, serverPosition) {
  const why = reason => { (bot._clutchWhy ||= []).push(`${Math.floor(bot.entity.position.y)}:${reason}`); if (bot._clutchWhy.length > 12) bot._clutchWhy.shift(); return null; };
  const feet = bot.entity.position, eye = serverPosition.offset(0, 1.62, 0);
  // Seven down from the eye, not five (note 1797): at two and a third blocks a tick the sample that sees the floor within five is the one 3.4 or less above it, often the last before the ground; 25588's dragon-168 (2026-10-17 23:22Z) fell 29 off its column with samples at 70, 68 and 66 'nothing within five below' and the ground at 60, never a click. Seen from seven, the sample at 4 to 5 above sees it and clicks within the reach of note 1795.
  const hit = bot.world.raycast(feet.offset(0, 1.62, 0), down, 7);
  if (!hit?.position) return why('nothing within seven below');
  const support = bot.blockAt(hit.position), p = hit.position.offset(0, 1, 0);
  if (support?.boundingBox !== 'block' || ['magma_block', 'cactus'].includes(support.name)) return why(`${support?.name || 'nothing'} under`);
  if (!['air', 'cave_air', 'void_air'].includes(bot.blockAt(p)?.name)) return why(`${bot.blockAt(p)?.name} where the water would go`);
  const aim = new Vec3(feet.x, p.y - .001, feet.z), delta = aim.minus(eye);
  // Reach 5.2, not 4.5 (note 1499): the server allows a block's use a block past the hand's 4.5, and at a fall's speed of a block and a half a tick the half block is a tick, the one tick there is. 25588 (dragon-72, 2026-10-13 18:27Z, full iron) stepped off its column at 88 with the bucket in hand and died on the ground at 62 with no water poured, two drops of eight before it dry.
  // Within 4.0 of the cell, not 5.2 (note 1504): the server's body trails the client's by a tick in a fall, a block and a half higher, and measures the reach from there; clicks sent at 5.2 were a block out of its reach and refused, the water never placed, and the retry (note 1499) came six ticks later on the ground. 25588 (dragon-74, 2026-10-13 19:12Z) stepped off crystal 77's column, clicked, and landed dry at (-15, 61, 36), 20 to 5. Clicked every tick from 4.0 down, the first click lands within the server's reach and the second a tick later.
  // 4.6 in a slow fall (note 1529): under a block a tick the server's body trails by less than a block, and a reach of 4.0 passed the last sample at 4.4 before the ground. 25588 (dragon-88, 2026-10-13 22:14Z) fell seven blocks at the western edge at 9.4 health, '5.5, 4.5, 4.4 to the cell, over 4.0', and landed on stone at 1.4.
  // 4.8 in a fast fall, not 4.0 (note 1795): at two and a third blocks a tick the window within 4.0 of the eye is 2.4 blocks tall, one sample or none, and 22 of 125 clutches on 25588 ended in the air, 19 of them 'N to the cell, over 4' at the last sample (dragon-163, 2026-10-17 22:15Z: 69, 67, 66 'nothing within five', then the ground at 61). A click the server refuses costs nothing, and the next tick's click within 4.0 still comes; the retry each tick (note 1498) stays.
  const reach = bot.entity.velocity.y > -1.0 ? 4.6 : 4.8;
  if (delta.norm() > reach) return why(`${delta.norm().toFixed(1)} to the cell, over ${reach}`);
  if (feet.y < p.y - .1) return why('the feet below the cell');
  const sight = bot.world.raycast(eye, delta.unit(), delta.norm() + .01);
  if (!sight?.position?.equals(hit.position)) return why(`the sight line ends at ${sight?.position || 'nothing'}, not the floor`);
  bot._clutchWhy = [];
  return { position: p, yaw: Math.atan2(-delta.x, -delta.z), pitch: Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) };
}

// One recovery at a time (note 1483): a second caller in the same fall gets
// the first's promise, not a second bucket click, which would take the water
// back up with the empty bucket.
// The caller's interrupt check is set aside for the whole recovery, from its
// first check (note 1484): the fall is the End fight's own emergency, and
// recoverFall called from the fight's tick watcher (note 1483) was thrown out
// by it at once, 'the water under the fall: dangerous_fall' (25588, dragon-65,
// 2026-10-13 16:21Z, from (40, 56, -23) at 15 health).
async function recoverFall(bot, task, goal, save, options = {}) {
  if (bot._fallRecovery) return bot._fallRecovery;
  const previousInterrupt = task.interruptCheck; task.interruptCheck = undefined;
  bot._fallRecovery = recoverFallOnce(bot, task, goal, save, options).finally(() => { bot._fallRecovery = null; task.interruptCheck = previousInterrupt; });
  return bot._fallRecovery;
}
// Not stopped by the task's cancellation (note 1538): the body is in the air
// whatever the task's fate, and the bucket is its only landing. 25588
// (dragon-93, 2026-10-13 23:36Z) fell 21 off its column at 17.3 health with a
// bucket in hand, 'the water under the fall: task cancelled: win', no click,
// dead on the rim. Death and a change of dimension end it; nothing else.
async function recoverFallOnce(bot, task, goal, save, { timeoutMs = 12000, refill = true } = {}) {
  const alive = () => { if (bot.health <= 0 || bot.isAlive === false) throw new Error('Fall recovery interrupted by dimension change or death'); };
  alive();
  if (!fallDanger(bot)) return false;
  const dimension = bot.game.dimension, initialHealth = bot.health;
  const water = bot.inventory.items().find(i => i.name === 'water_bucket');
  // With no water there is nothing to do in the air but land: as Blocked it
  // stopped the dragon fight mid-flight at twelve health, alive.
  if (!water) {
    const until = Date.now() + 5000;
    while (bot.entity.onGround === false && Date.now() < until) { if (bot.health <= 0 || bot.isAlive === false) break; await new Promise(r => setTimeout(r, 50)); }
    return false;
  }
  if (String(dimension).includes('nether')) throw new Error('Water cannot protect a landing in the Nether');
  const before = countOf(bot, 'water_bucket'), emptyBefore = countOf(bot, 'bucket');
  bot.pathfinder.setGoal(null); bot.clearControlStates(); bot.stopDigging?.();
  const previousInterrupt = task.interruptCheck; task.interruptCheck = undefined;
  let previous = bot.entity.position.clone(), used, failure, wetSince = 0, poolSince = 0, dryLanding;
  const check = () => {
    if (bot.game.dimension !== dimension || bot.health <= 0 || bot.isAlive === false) throw new Error('Fall recovery interrupted by dimension change or death');
  };
  let ended = false, reequipping = false;
  const tick = () => {
    try {
      check();
      // Clicked again (note 1499) when a click has brought no water and no
      // empty bucket in 120 ms and the body is still falling: a click the
      // server refused is nothing to pick back up. Converted, no second click.
      const converted = countOf(bot, 'water_bucket') === before - 1 && countOf(bot, 'bucket') === emptyBefore + 1;
      const retry = used && !converted && Date.now() - used.at >= 40 && bot.blockAt(used.position)?.name !== 'water' && bot.entity.onGround === false;
      // Falling in earnest, half a block a tick or more (note 1513): a jump's
      // way down peaks near 0.4, and the clutch, woken by the climb's jump
      // (fallDanger takes a rise over 0.6 as a knock), clicked at the ground a
      // block under the feet and poured the bucket out on the column's first
      // block. 25588 (dragon-78, 2026-10-13 20:08Z): 'water clicked at
      // (-9, 62, -37) from the body at (-9, 62, -37), falling -0.08 a tick';
      // the buckets lost all day with no pour logged, and the 'water under the
      // feet' that stopped climbs.
      // And 0.85 a tick, not 0.5 (note 1518): a body at 0.85 has fallen five
      // blocks and more, and a fall of five is two health at most, not worth
      // the bucket that is then short at the column. 25588 (dragon-81,
      // 2026-10-13 20:38Z) poured both buckets on falls of three into the
      // quarry's pits and climbed with none.
      // The bucket put back in the hand mid-fall (note 1709): the fight's own
      // routines go on during the fall and take the weapon or a block into the
      // hand, and the click below waits for the bucket that is no longer
      // there. 25588 (dragon-251, 2026-10-15 08:30Z) walked off a rim at 57 out
      // of a trench with an enderman beside, one full bucket carried, and
      // landed dry at 46, 20 to 12, 'the clutch was never asked'; two
      // endermen killed it there.
      if (!used && !reequipping && bot.heldItem?.name !== 'water_bucket' && bot.entity.velocity.y <= -0.5) {
        const w = bot.inventory.items().find(i => i.name === 'water_bucket');
        if (w) {
          reequipping = true;
          console.log(`[fall] the bucket put back in the hand at ${bot.entity.position.floored()} (${bot.heldItem?.name || 'nothing'} held), falling ${bot.entity.velocity.y.toFixed(2)} a tick`);
          bot.equip(w, 'hand').catch(() => {}).finally(() => { reequipping = false; });
        }
      }
      if ((!used || retry) && bot.heldItem?.name === 'water_bucket' && bot.entity.velocity.y <= -0.85) {
        const target = clutchTarget(bot, previous);
        if (target) {
          // Forced look updates the rotation carried in use_item immediately.
          // Send once, before this tick's movement packet; a repeated click
          // could pick the just-placed water back up with the now-empty bucket.
          bot.look(target.yaw, target.pitch, true).catch(err => { failure = err; });
          bot.activateItem(); used = { at: Date.now(), position: target.position, serverPosition: previous.clone(), clicks: (used?.clicks || 0) + 1 };
          // Said as it happens (note 1508), for a fall that ends in a death: 25588 (dragon-76, 2026-10-13 19:36Z) was knocked off an obsidian top at 88 by the breath, clicked, used a bucket, and died on the ground at 62 three blocks east of where it clicked, with no word of where the water went.
          console.log(`[fall] water clicked (${used.clicks}) at ${target.position} from the body at ${bot.entity.position.floored()} (server about ${previous.floored()}), falling ${bot.entity.velocity.y.toFixed(2)} a tick, health ${bot.health.toFixed(1)}`);
          goal.step = { ...(goal.step || {}), waterClicked: { at: { x: target.position.x, y: target.position.y, z: target.position.z }, body: { ...bot.entity.position }, clicks: used.clicks } }; save();
        }
      }
    } catch (err) { failure = err; }
    previous = bot.entity.position.clone();
  };
  try {
    await bot.equip(water, 'hand'); check();
    goal.step = { action: 'protect_fall_with_water', from: { ...bot.entity.position }, velocity: { ...bot.entity.velocity } }; save();
    bot.on('physicsTick', tick);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      check(); if (failure) throw failure;
      const converted = countOf(bot, 'water_bucket') === before - 1 && countOf(bot, 'bucket') === emptyBefore + 1;
      const inPlacedWater = used && bot.blockAt(used.position)?.name === 'water' &&
        bot.blockAt(bot.entity.position.floored())?.name === 'water' && Math.abs(bot.entity.velocity.y) < .3;
      if (converted && inPlacedWater) {
        wetSince ||= Date.now();
        if (Date.now() - wetSince >= 250) {
          const evidence = { at: Date.now(), source: { ...used.position }, landing: { ...bot.entity.position }, initialHealth,
            health: bot.health, waterConsumed: 1, sourceConfirmed: true };
          goal.fallRecoveries ||= []; goal.fallRecoveries.push(evidence); goal.fallRecoveries = goal.fallRecoveries.slice(-20); save();
          bot.emit('fall_recovery', evidence);
          if (refill) {
            try { await fillWaterBucket(bot, task, used.position, { guard: check }); evidence.bucketRecovered = true; save(); }
            catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
          }
          // The clutch's water remembered as a pool left (note 1564) where it was not taken back.
          if (!evidence.bucketRecovered && goal.endCombat) { (goal.endCombat.poolsLeft ||= []).push({ x: used.position.x, y: used.position.y, z: used.position.z, at: Date.now() }); save(); }
          ended = true; return true;
        }
      } else wetSince = 0;
      // Down in standing water with no click of its own (note 1546): the pool
      // at the column's foot is the landing, and the body is done falling the
      // moment it floats there. Waited for a dry stand instead, the watcher
      // let the trench's current carry the body a block a second, and 25588
      // (dragon-97, 2026-10-14 00:24Z) landed its 27-block drop in the pool at
      // (-8, 61, -38), drifted to (3, 60, -41) in six seconds, 'landed dry'
      // there, and the pool thirteen blocks back was never taken up.
      if (!used && bot.blockAt(bot.entity.position.floored())?.name === 'water' && Math.abs(bot.entity.velocity.y) < .3 && bot.entity.position.y <= (goal.step?.from?.y ?? Infinity) - 3) {
        poolSince ||= Date.now();
        if (Date.now() - poolSince >= 250) {
          const evidence = { at: Date.now(), landing: { ...bot.entity.position }, initialHealth, health: bot.health, outcome: 'landed_in_standing_water', waterConsumed: 0 };
          goal.lastFallLanding = evidence; save(); bot.emit('fall_recovery', evidence);
          console.log(`[fall] landed in the water at ${bot.entity.position.floored()}, ${initialHealth.toFixed(1)} to ${bot.health.toFixed(1)}, no bucket used`);
          bot.clearControlStates();
          ended = true; return true;
        }
      } else poolSince = 0;
      if (bot.entity.onGround && Math.abs(bot.entity.velocity.y) < .1 && dryStanding(bot, bot.entity.position)) {
        if (!dryLanding || dryLanding.position.distanceTo(bot.entity.position) > .3) dryLanding = { at: Date.now(), position: bot.entity.position.clone() };
        if (Date.now() - dryLanding.at >= 150) {
          // Horizontal knockback can carry the player past the placed water.
          // A real dry landing ends the airborne emergency; it does not prove
          // that water protected the fall. Recover the spent bucket if the
          // observed source is still reachable instead of waiting for water
          // immersion that cannot occur while standing still on dry ground.
          const evidence = { at: Date.now(), landing: { ...bot.entity.position }, initialHealth, health: bot.health,
            outcome: 'stable_dry_landing', waterProtectionConfirmed: false, attemptedWater: !!used, noWaterBecause: used ? undefined : (bot._clutchWhy || []).slice(-6),
            source: used && { ...used.position }, waterConsumed: converted ? 1 : 0 };
          goal.lastFallLanding = evidence; save(); bot.emit('fall_recovery', evidence);
          if (!used) console.log(`[fall] landed dry at ${bot.entity.position.floored()} with no water poured, ${initialHealth.toFixed(1)} to ${bot.health.toFixed(1)}: ${(bot._clutchWhy || []).slice(-6).join('; ') || 'the clutch was never asked (the bucket not in hand, or not falling)'}`);
          else if (!converted) console.log(`[fall] landed dry at ${bot.entity.position.floored()}, ${initialHealth.toFixed(1)} to ${bot.health.toFixed(1)}: clicked ${used.clicks || 1} time${(used.clicks || 1) === 1 ? '' : 's'} at ${used.position} from ${used.serverPosition.floored()}, no water came of it (the server refused the placing)`);
          if (refill && converted && used) {
            try { await fillWaterBucket(bot, task, used.position, { guard: check }); evidence.bucketRecovered = true; save(); }
            catch (err) { if (['Cancelled', 'Blocked', 'NeedsAir'].includes(err.name)) throw err; }
          }
          if (converted && used && !evidence.bucketRecovered && goal.endCombat) { (goal.endCombat.poolsLeft ||= []).push({ x: used.position.x, y: used.position.y, z: used.position.z, at: Date.now() }); save(); }
          ended = true; return false;
        }
      } else dryLanding = undefined;
      await sleep(10);
    }
    ended = true;
    throw new Error('No living landing in server-confirmed placed water within the fall-recovery deadline');
  } finally {
    // Said when the clutch ends in the air (note 1538): the death's record otherwise keeps nothing of why no water was clicked.
    if (!ended && !used) console.log(`[fall] the clutch ended in the air at ${bot.entity.position.floored()}, ${bot.health.toFixed(1)} health, no water clicked: ${(bot._clutchWhy || []).slice(-6).join('; ') || 'no reason kept'}`);
    bot.removeListener('physicsTick', tick); bot.deactivateItem(); bot.clearControlStates(); task.interruptCheck = previousInterrupt;
  }
}
module.exports = { fallDanger, clutchTarget, recoverFall };
