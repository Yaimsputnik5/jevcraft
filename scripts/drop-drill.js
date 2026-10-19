'use strict';
// How far the water drop's step off a column carries the body (note 1903):
// 25588's dragon-277 stepped off at 97 over a pool one cell out and came
// down three out, dry. Here the bot stands on a one-wide column of a set
// height over a wide water floor in the sky, steps off east as the drop
// does (forward until the feet leave the block, end-combat.js waterDrop),
// then holds the back key for a set number of ticks, and where it lands is
// the answer. Staged through the arena's console pipe (no operator).
//   ARENA_DIR=$HOME/Code/jevcraft/.test-combat MC_PORT=25574 node scripts/drop-drill.js
const fs = require('fs'), path = require('path');
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');
const { arenaDir } = require('./lib/arena');
const { Task } = require('../src/skills');

const port = Number(process.env.MC_PORT || 25574);
if ([25565, 25570, 25576, 25577, 25578, 25579].includes(port) || (port >= 25581 && port <= 25610)) throw new Error('The drop drill needs the arena port');
const consolePath = process.env.ARENA_CONSOLE || path.join(arenaDir(), 'console.in');
const username = process.env.ARENA_USER || 'ArenaJev';
const heights = (process.env.DROP_HEIGHTS || '20,30,40').split(',').map(Number);
const backs = (process.env.DROP_BACK_TICKS || '0,4,8').split(',').map(Number);
const repeats = Number(process.env.DROP_REPEATS || 2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function command(line) { fs.writeFileSync(consolePath, line + '\n'); await sleep(200); }

const bot = mineflayer.createBot({ host: '127.0.0.1', port, username, version: '26.1', auth: 'offline' });
bot.once('spawn', async () => {
  const rows = [];
  try {
    await sleep(2000);
    await command(`gamemode survival ${username}`);
    let i = 0;
    for (let r = 0; r < repeats; r++) for (const h of heights) for (const back of backs) {
      const X = 2000 + (i++) * 24, floor = 100, top = floor + h;
      await command(`forceload add ${X - 4} -8 ${X + 16} 8`); await sleep(1500);
      await command(`fill ${X - 4} ${floor - 2} -8 ${X + 16} ${top + 3} 8 air`);
      await command(`fill ${X - 4} ${floor - 1} -8 ${X + 16} ${floor - 1} 8 glass`);
      await command(`fill ${X - 4} ${floor} -8 ${X + 16} ${floor + 1} 8 water`);
      await command(`fill ${X} ${floor} 0 ${X} ${top - 1} 0 glass`);
      await command(`tp ${username} ${X + .5} ${top} 0.5 -90 0`);
      await sleep(1500);
      await command(`effect give ${username} minecraft:instant_health 1 10`); await sleep(500);
      const task = new Task('drop drill');
      const start = bot.entity.position.clone();
      await bot.look(-Math.PI / 2, 0, true);
      try {
        await require('../src/motion').move(bot, task, { label: 'water_drop', keys: ['forward'], sneak: false, why: 'the drop drill: off the column east', look: new Vec3(X + 12.5, top + 1, 0.5), maxMs: 2000, tick: 25, intoFall: true, until: () => !bot.entity.onGround && bot.entity.position.y < top - 0.5 });
      } catch (err) { console.log(JSON.stringify({ moveError: String(err.message || err) })); }
      bot.clearControlStates();
      if (back > 0) { bot.setControlState('back', true); await sleep(back * 50); bot.setControlState('back', false); }
      const t0 = Date.now(); let hit = null;
      while (Date.now() - t0 < 8000) { await sleep(25); if (bot.entity.position.y <= floor + 1.2 && !hit) hit = bot.entity.position.clone(); if (hit) break; }
      const row = { height: h, back, repeat: r, out: hit ? Math.round((hit.x - (X + .5)) * 100) / 100 : null, side: hit ? Math.round((hit.z - 0.5) * 100) / 100 : null, start: Math.round((start.x - (X + .5)) * 100) / 100 };
      rows.push(row); console.log(JSON.stringify(row));
      await command(`forceload remove ${X - 4} -8 ${X + 16} 8`);
      await sleep(1000);
    }
  } catch (err) { console.log(JSON.stringify({ error: String(err.message || err) })); }
  const by = {};
  for (const r of rows) (by[`${r.height}/${r.back}`] ||= []).push(r.out);
  console.log(`[drop drill] landing distance east of the column's middle, by height/back ticks: ${Object.entries(by).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}`);
  bot.quit(); setTimeout(() => process.exit(0), 500);
});
bot.on('kicked', r => { console.log(JSON.stringify({ kicked: String(r) })); process.exit(1); });
bot.on('error', e => console.log(JSON.stringify({ error: String(e.message || e) })));
