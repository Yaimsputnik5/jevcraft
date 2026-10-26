'use strict';
const { goals } = require('mineflayer-pathfinder');
const { dimension } = require('./game-progress');
const { dryStanding } = require('./mining-access');
const { surveyRoute } = require('./skills');
const { checkAir } = require('./vitals');
const { checkThreats } = require('./danger');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const blocked = message => Object.assign(new Error(message), { name: 'Blocked' });

async function exitEnd(bot, task, goal, save, { navigate }, { timeoutMs = 20000 } = {}) {
  task.check();
  const credit = goal.gameProgress?.milestones.dragon_defeated;
  if (!credit || credit.source !== 'minecraft:end/kill_dragon') throw blocked('End return requires verified player dragon-kill credit');
  if (dimension(bot) !== 'end' || bot.game.gameMode !== 'survival' || bot.health <= 0) throw blocked('End return requires a living Survival player in the End');
  const portals = bot.findBlocks({ matching: bot.registry.blocksByName.end_portal.id, maxDistance: 96, count: 32 });
  if (!portals.length) throw blocked('No active exit portal is visible after dragon defeat');
  const movement = bot.pathfinder.movements;
  const previous = { canDig: movement.canDig, scafoldingBlocks: movement.scafoldingBlocks, allow1by1towers: movement.allow1by1towers };
  Object.assign(movement, { canDig: false, scafoldingBlocks: [], allow1by1towers: false });
  const dead = () => { if (bot.health <= 0) throw blocked('Died during End return'); };
  let destination;
  try {
    // A saved coordinate or empty fountain is insufficient. The target must
    // still be a loaded, active portal on the route we actually execute.
    for (const p of portals) {
      task.check(); checkAir(bot); checkThreats(bot); dead();
      const candidate = new goals.GoalBlock(p.x, p.y, p.z);
      const route = await surveyRoute(bot, task, movement, candidate, 350);
      if (route.status === 'success') { destination = { goal: candidate, p }; break; }
    }
    if (!destination) throw blocked('No observed walking route into the active End exit portal');
    goal.step = { action: 'exit_end_portal', position: { ...destination.p } }; save();
    if (bot.blockAt(destination.p)?.name !== 'end_portal') throw blocked('The End exit portal changed before approach');
    try {
      await navigate(bot, task, destination.goal, { timeoutMs, stallMs: 4000,
        stopWhen: () => dimension(bot) !== 'end' || !!goal.gameProgress.milestones.exit_portal_used });
    } catch (err) { if (['Cancelled', 'NeedsAir', 'NeedsSafety'].includes(err.name)) throw err; }
    bot.pathfinder.setGoal(null); bot.clearControlStates();
    // The last step into the portal walked, not pathed (note 2181): the pathfinder stops beside the portal's
    // block, on the bedrock rim, and the body never meets the portal. full-3 (25593) stood at (-1, 64, 2)
    // from 09:01Z, 'exit_end_portal' retried 239 times in 40 minutes. The portal is below the rim's top: the
    // walk is straight at the block's middle, a short burst at a time, until the dimension changes.
    if (dimension(bot) === 'end' && !goal.gameProgress.milestones.exit_portal_used) {
      const { Vec3 } = require('vec3'), { move } = require('./motion');
      const here = bot.entity.position;
      const near = portals.map(q => new Vec3(q.x, q.y, q.z)).filter(q => bot.blockAt(q)?.name === 'end_portal').sort((a, b) => a.offset(.5, 0, .5).distanceTo(here) - b.offset(.5, 0, .5).distanceTo(here))[0];
      if (near && near.offset(.5, 0, .5).distanceTo(here) <= 4) {
        console.log(`[end exit] stepping into the portal at ${near} from ${here.floored()}`);
        const began = Date.now();
        while (Date.now() - began < 6000 && dimension(bot) === 'end') {
          task.check(); dead();
          try { await move(bot, task, { label: 'exit_end_portal', keys: ['forward'], sneak: false, why: 'into the exit portal', look: near.offset(.5, .5, .5), maxMs: 600, tick: 50, until: () => dimension(bot) !== 'end' }); }
          catch (err) { if (err.name === 'Cancelled') throw err; break; }
        }
      }
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      task.check(); dead();
      const exited = goal.gameProgress.milestones.exit_portal_used;
      if (exited && dimension(bot) === 'overworld' && bot.isAlive !== false && dryStanding(bot, bot.entity.position)) {
        goal.endReturn = { at: Date.now(), position: { ...bot.entity.position }, health: bot.health, source: 'living_exit_portal_return' }; save(); return;
      }
      await sleep(50);
    }
    throw blocked('No exit-portal event followed by a living, loaded Overworld landing was confirmed');
  } finally { bot.pathfinder.setGoal(null); bot.clearControlStates(); Object.assign(movement, previous); }
}

module.exports = { exitEnd };
