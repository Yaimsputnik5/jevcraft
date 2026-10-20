'use strict';
// What a biter at the bot does to the pillar's two blocks (note 1947): of
// the four fresh runs' 97 pillar choices (2026-10-19/20), 39 had a biter at
// arm's length before the pillar's 1.5 seconds, and 10 of those ended in a
// death within fifteen seconds (1 of the other 58). full-2 (04:44:51Z) took
// the pillar at 16 health told "about 8 damage ... the 1.5 seconds of going
// up included. Two up, none of them reaches it", a piglin 5 blocks off, and
// was slain by it three seconds later. Here the bot stands on a flat pad
// with a biter summoned a set distance off, runs pillarUp for two blocks as
// the stance does (pillar-recovery.js, maxBlocks 2, threats false), and
// what is measured is whether it got two up, how long it took, how many
// blocks went down, whether the body was carried off its cell, and the
// health it cost. Staged through the arena's console pipe (no operator).
//   ARENA_DIR=$HOME/Code/jevcraft/.test-combat MC_PORT=25574 node scripts/pillar-drill.js
//   PILLAR_MOBS=zombie,piglin PILLAR_DISTANCES=0,3,5,8 PILLAR_REPEATS=3
const fs = require('fs'), path = require('path');
const mineflayer = require('mineflayer');
const { arenaDir } = require('./lib/arena');
const { Task } = require('../src/skills');

const port = Number(process.env.MC_PORT || 25574);
if ([25565, 25570, 25576, 25577, 25578, 25579].includes(port) || (port >= 25581 && port <= 25610)) throw new Error('The pillar drill needs the arena port');
const consolePath = process.env.ARENA_CONSOLE || path.join(arenaDir(), 'console.in');
const username = process.env.ARENA_USER || 'ArenaJev';
const mobs = (process.env.PILLAR_MOBS || 'none,zombie,piglin').split(',');
const distances = (process.env.PILLAR_DISTANCES || '3,5,8').split(',').map(Number);
const repeats = Number(process.env.PILLAR_REPEATS || 3);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function command(line) { fs.writeFileSync(consolePath, line + '\n'); await sleep(200); }
const summonOf = (mob, x, y, z) => mob === 'piglin'
  ? `summon minecraft:piglin ${x} ${y} ${z} {IsImmuneToZombification:1b,PersistenceRequired:1b,equipment:{mainhand:{id:"minecraft:golden_sword",count:1}}}`
  : `summon minecraft:${mob} ${x} ${y} ${z} {PersistenceRequired:1b}`;

const bot = mineflayer.createBot({ host: '127.0.0.1', port, username, version: '26.1', auth: 'offline' });
bot.loadPlugin(require('mineflayer-pathfinder').pathfinder);
bot.once('spawn', async () => {
  const rows = [];
  try {
    await sleep(2000);
    await command(`gamemode survival ${username}`);
    const { pillarUp } = require('../src/pillar-recovery');
    let i = 0;
    for (let r = 0; r < repeats; r++) for (const mob of mobs) for (const d of (mob === 'none' ? [0] : distances)) {
      const X = 2300 + (i++) * 24, floor = 100;
      await command(`forceload add ${X - 6} -8 ${X + 18} 8`); await sleep(1200);
      await command(`fill ${X - 6} ${floor - 1} -8 ${X + 18} ${floor + 7} 8 air`);
      await command(`fill ${X - 6} ${floor - 1} -8 ${X + 18} ${floor - 1} 8 stone`);
      await command(`fill ${X - 6} ${floor + 7} -8 ${X + 18} ${floor + 7} 8 stone`);
      await command(`fill ${X - 6} ${floor} -8 ${X - 6} ${floor + 6} 8 stone`);
      await command(`fill ${X + 18} ${floor} -8 ${X + 18} ${floor + 6} 8 stone`);
      await command(`fill ${X - 6} ${floor} -8 ${X + 18} ${floor + 6} -8 stone`);
      await command(`fill ${X - 6} ${floor} 8 ${X + 18} ${floor + 6} 8 stone`);
      await command(`clear ${username}`);
      await command(`give ${username} cobblestone 64`);
      await command(`tp ${username} ${X + .5} ${floor} 0.5 -90 0`);
      await sleep(1200);
      await command(`effect give ${username} minecraft:instant_health 1 10`); await sleep(400);
      if (mob !== 'none') { await command(summonOf(mob, X + d + .5, floor, 0.5)); await sleep(250); }
      const task = new Task('pillar drill');
      const start = bot.entity.position.clone(), hp0 = bot.health, t0 = Date.now();
      let placed = 0, error = null;
      try { placed = await pillarUp(bot, task, start.y + 2, { dig: async () => { throw new Error('no dig in the drill'); }, maxBlocks: 2, threats: false }); }
      catch (err) { error = String(err.message || err).slice(0, 80); }
      const ms = Date.now() - t0;
      await sleep(600);
      const p = bot.entity.position;
      const row = { mob, distance: d, repeat: r, twoUp: p.y >= start.y + 1.9, up: Math.round((p.y - start.y) * 10) / 10, placed, ms, carried: Math.round(Math.hypot(p.x - start.x, p.z - start.z) * 10) / 10, cellMoved: Math.floor(p.x) !== Math.floor(start.x) || Math.floor(p.z) !== Math.floor(start.z), lost: Math.round((hp0 - bot.health) * 10) / 10, error };
      rows.push(row); console.log(JSON.stringify(row));
      await command(`kill @e[type=!minecraft:player,x=${X},y=${floor},z=0,distance=..40]`);
      await command(`forceload remove ${X - 6} -8 ${X + 18} 8`);
      await sleep(800);
    }
  } catch (err) { console.log(JSON.stringify({ error: String(err.message || err) })); }
  const by = {};
  for (const r of rows) (by[`${r.mob}@${r.distance}`] ||= []).push(r);
  console.log(`[pillar drill] two up / tries, median ms, median health lost, carried off the cell: ${Object.entries(by).map(([k, v]) => `${k}: ${v.filter(x => x.twoUp).length}/${v.length}, ${v.map(x => x.ms).sort((a, b) => a - b)[Math.floor(v.length / 2)]} ms, ${v.map(x => x.lost).sort((a, b) => a - b)[Math.floor(v.length / 2)]} lost, ${v.filter(x => x.cellMoved).length} carried`).join('; ')}`);
  bot.quit(); setTimeout(() => process.exit(0), 500);
});
bot.on('kicked', r => { console.log(JSON.stringify({ kicked: String(r) })); process.exit(1); });
bot.on('death', () => console.log(JSON.stringify({ died: true, at: new Date().toISOString() })));
bot.on('error', e => console.log(JSON.stringify({ error: String(e.message || e) })));
