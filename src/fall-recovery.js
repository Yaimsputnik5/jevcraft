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
  const hit = bot.world.raycast(feet.offset(0, 1.62, 0), down, 5);
  if (!hit?.position) return why('nothing within five below');
  const support = bot.blockAt(hit.position), p = hit.position.offset(0, 1, 0);
  if (support?.boundingBox !== 'block' || ['magma_block', 'cactus'].includes(support.name)) return why(`${support?.name || 'nothing'} under`);
  if (!['air', 'cave_air', 'void_air'].includes(bot.blockAt(p)?.name)) return why(`${bot.blockAt(p)?.name} where the water would go`);
  const aim = new Vec3(feet.x, p.y - .001, feet.z), delta = aim.minus(eye);
  // Reach 5.2, not 4.5 (note 1499): the server allows a block's use a block past the hand's 4.5, and at a fall's speed of a block and a half a tick the half block is a tick, the one tick there is. 25588 (dragon-72, 2026-10-13 18:27Z, full iron) stepped off its column at 88 with the bucket in hand and died on the ground at 62 with no water poured, two drops of eight before it dry.
  if (delta.norm() > 5.2) return why(`${delta.norm().toFixed(1)} to the cell, over 5.2`);
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
async function recoverFallOnce(bot, task, goal, save, { timeoutMs = 12000, refill = true } = {}) {
  task.check();
  if (!fallDanger(bot)) return false;
  const dimension = bot.game.dimension, initialHealth = bot.health;
  const water = bot.inventory.items().find(i => i.name === 'water_bucket');
  // With no water there is nothing to do in the air but land: as Blocked it
  // stopped the dragon fight mid-flight at twelve health, alive.
  if (!water) {
    const until = Date.now() + 5000;
    while (bot.entity.onGround === false && Date.now() < until) { task.check(); if (bot.health <= 0 || bot.isAlive === false) break; await new Promise(r => setTimeout(r, 50)); }
    return false;
  }
  if (String(dimension).includes('nether')) throw new Error('Water cannot protect a landing in the Nether');
  const before = countOf(bot, 'water_bucket'), emptyBefore = countOf(bot, 'bucket');
  bot.pathfinder.setGoal(null); bot.clearControlStates(); bot.stopDigging?.();
  const previousInterrupt = task.interruptCheck; task.interruptCheck = undefined;
  let previous = bot.entity.position.clone(), used, failure, wetSince = 0, dryLanding;
  const check = () => {
    task.check();
    if (bot.game.dimension !== dimension || bot.health <= 0 || bot.isAlive === false) throw new Error('Fall recovery interrupted by dimension change or death');
  };
  const tick = () => {
    try {
      check();
      // Clicked again (note 1499) when a click has brought no water and no
      // empty bucket in 120 ms and the body is still falling: a click the
      // server refused is nothing to pick back up. Converted, no second click.
      const converted = countOf(bot, 'water_bucket') === before - 1 && countOf(bot, 'bucket') === emptyBefore + 1;
      const retry = used && !converted && Date.now() - used.at >= 120 && bot.blockAt(used.position)?.name !== 'water' && bot.entity.onGround === false;
      if ((!used || retry) && bot.heldItem?.name === 'water_bucket' && bot.entity.velocity.y < 0) {
        const target = clutchTarget(bot, previous);
        if (target) {
          // Forced look updates the rotation carried in use_item immediately.
          // Send once, before this tick's movement packet; a repeated click
          // could pick the just-placed water back up with the now-empty bucket.
          bot.look(target.yaw, target.pitch, true).catch(err => { failure = err; });
          bot.activateItem(); used = { at: Date.now(), position: target.position, serverPosition: previous.clone(), clicks: (used?.clicks || 0) + 1 };
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
            await fillWaterBucket(bot, task, used.position, { guard: check });
            evidence.bucketRecovered = true; save();
          }
          return true;
        }
      } else wetSince = 0;
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
          if (refill && converted && used) {
            await fillWaterBucket(bot, task, used.position, { guard: check });
            evidence.bucketRecovered = true; save();
          }
          return false;
        }
      } else dryLanding = undefined;
      await sleep(10);
    }
    throw new Error('No living landing in server-confirmed placed water within the fall-recovery deadline');
  } finally {
    bot.removeListener('physicsTick', tick); bot.deactivateItem(); bot.clearControlStates(); task.interruptCheck = previousInterrupt;
  }
}
module.exports = { fallDanger, clutchTarget, recoverFall };
