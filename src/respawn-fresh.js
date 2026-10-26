'use strict';
// A deliberate death to come back to life at the bed with a fresh start, as
// a route on the Nether's wood search when the bot stands with no pickaxe and
// no block (note 2173; the user, 2026-10-26 08:40Z: offer it, its cost said,
// never run unasked). full-7 spent 83% of a Nether stay with no pickaxe (note
// 2132), and of the day's 43 none_good answers on nether_gather, 41 were a
// bot that could neither dig nor span. What it costs: everything carried
// drops here and vanishes in five minutes (the rods and pearls among it), the
// respawn is at the bed last slept in or the world spawn, and the full runs'
// record puts the time from a death to the kit worn and held again at 73
// minutes (49 of 115 bot-hours in the day to 2026-10-26 08:00Z, 40 deaths).
// What the same spot has come to on the full runs (the decision records of 2026-10-25 06:00Z to 10-26 09:00Z): the
// spells in the Nether with no pickaxe and no block, read from the asks whose state said so, ten minutes apart at most.
const SPELLS = Object.freeze({ window: '2026-10-25 06:00Z to 10-26 09:00Z', count: 19, minutes: 239, median: 9, longest: 115, longestNoneGood: 60, died: 1, otherwise: 18 });
const spellsSays = () => `On the full runs (${SPELLS.window}) a bot stood in the Nether with no pickaxe and no block ${SPELLS.count} times, ${SPELLS.minutes} minutes in all (the median spell about ${SPELLS.median} minutes, the longest ${SPELLS.longest}, with ${SPELLS.longestNoneGood} 'none good' answers in it): ${SPELLS.died} of the ${SPELLS.count} ended in a death, ${SPELLS.otherwise} in a pickaxe or blocks got, or the portal reached, on the ground the bot could walk.`;
const REKIT = Object.freeze({ window: '2026-10-25 06:00Z to 10-26 08:00Z', deaths: 40, minutesEach: 73, shareOfTime: 43 });
const DEATH_WAIT_MS = 90000;
const words = s => String(s || '').replaceAll('_', ' ');

// Whether the way is on offer: the Nether, no pickaxe, no block, lava known within reach. -> { lava } or null
function offered(bot, goal, { lava = null } = {}) {
  if (!/nether/.test(String(bot.game?.dimension || ''))) return null;
  const items = bot.inventory?.items?.() || [];
  if (items.some(i => /_pickaxe$/.test(i.name))) return null;
  let blocks = 0; try { blocks = require('./bridging').blocksCarried(bot); } catch (_) { blocks = items.filter(i => /cobblestone|netherrack|dirt|planks|stone$/.test(i.name)).length; }
  if (blocks > 0) return null;
  if (!lava || !(lava.distance <= 64)) return null;
  return { lava };
}

// The option's words: the drop, the respawn, the lava, the record.
function says(bot, goal, { lava }) {
  const items = bot.inventory?.items?.() || [];
  const stacks = items.length;
  const valued = items.filter(i => /blaze_rod|ender_pearl|ender_eye|blaze_powder|diamond|gold_ingot|iron_ingot|_sword$|shield|_helmet$|_chestplate$|_leggings$|_boots$|bed$/.test(i.name)).map(i => `${i.count} ${words(i.name)}${i.count > 1 && !/s$/.test(i.name) ? 's' : ''}`);
  const sp = bot.spawnPoint, here = bot.entity?.position;
  const bed = goal?.survival?.spawnBed?.foot;
  const respawn = bed ? `the bed at (${bed.x}, ${bed.y}, ${bed.z}) in the Overworld` : sp ? `the world spawn at (${Math.round(sp.x)}, ${Math.round(sp.y)}, ${Math.round(sp.z)}) in the Overworld, with nothing` : 'the world spawn, with nothing';
  let worth = ''; try { worth = goal?.kind === 'win' ? ` ${require('./eye-need').says(bot, goal, { brief: true })}` : ''; } catch (_) { worth = ''; }
  return `Die here on purpose and come back to life at ${respawn}: walk into the lava ${lava.distance} blocks off at (${lava.at.x}, ${lava.at.y}, ${lava.at.z}) and stay in it. Everything carried, ${stacks} stack${stacks === 1 ? '' : 's'}${valued.length ? ` (${valued.join(', ')} among them)` : ''}, drops here and vanishes about five minutes later; nothing is got back. The Nether portal and this place are left as they are. On the full runs (${REKIT.window}) the time from a death to the kit worn and held again was about ${REKIT.minutesEach} minutes a death (${REKIT.deaths} deaths, ${REKIT.shareOfTime}% of the day's time); a bot with no pickaxe and no block here has no way to dig or span, only the ground it can walk. ${spellsSays()}${worth}`;
}

// Carried out: the flag that stands the body's lava rule and the survival layer down for a minute and a half, the
// walk to the lava, the step in, and the wait for the death. -> true when the bot died.
async function run(bot, task, goal, save, { lava, navigate, move }) {
  goal.deliberateDeath = { at: Date.now(), why: 'Jev chose to come back to life fresh (respawn_fresh)' }; save?.();
  bot.chat?.('Nothing to dig or span with here. Starting over from the bed.');
  const { goals } = require('mineflayer-pathfinder');
  try { await navigate(bot, task, new goals.GoalNear(lava.at.x, lava.at.y, lava.at.z, 2), { timeoutMs: 60000, stallMs: 8000 }); } catch (err) { task.check(); if (['Cancelled'].includes(err.name)) throw err; }
  const began = Date.now();
  while (Date.now() - began < DEATH_WAIT_MS && (bot.health ?? 0) > 0 && bot.isAlive !== false) {
    task.check();
    try { await move(bot, task, { label: 'respawn_fresh', keys: ['forward'], sneak: false, why: 'into the lava, as Jev chose', look: new (require('vec3').Vec3)(lava.at.x + 0.5, lava.at.y + 0.5, lava.at.z + 0.5), maxMs: 1500, tick: 50, until: () => (bot.health ?? 0) <= 0 }); }
    catch (err) { if (err.name === 'Cancelled') throw err; }
  }
  return (bot.health ?? 0) <= 0 || bot.isAlive === false;
}

// Whether the flag stands now (the lava rule and the survival step read it).
const standing = (goal, now = Date.now()) => !!goal?.deliberateDeath && now - goal.deliberateDeath.at < DEATH_WAIT_MS;

module.exports = { offered, says, run, standing, spellsSays, SPELLS, REKIT, DEATH_WAIT_MS };
