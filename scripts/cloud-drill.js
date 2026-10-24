'use strict';
// How far a breath cloud reaches over and under it (note 1889): the live
// lines read it both ways (notes 1869, 1870, 1877, 1880, 1884), because a
// hurt line is written after the body has moved. Here the body stands still
// at a set height from a harming cloud laid on a floor in the sky, one case
// at a time, and the health it loses is the answer. Staged through the
// arena's console pipe (no operator); the bot does nothing but stand.
//   ARENA_DIR=$HOME/Code/jevcraft/.test-combat MC_PORT=25574 node scripts/cloud-drill.js
const fs = require('fs'), path = require('path');
const mineflayer = require('mineflayer');
const { arenaDir } = require('./lib/arena');

const port = Number(process.env.MC_PORT || 25574);
if ([25565, 25570, 25576, 25577, 25578, 25579].includes(port) || (port >= 25581 && port <= 25610)) throw new Error('The cloud drill needs the arena port');
const consolePath = process.env.ARENA_CONSOLE || path.join(arenaDir(), 'console.in');
const username = process.env.ARENA_USER || 'ArenaJev';
// The feet's height over the cloud (negative: under it, a one-thick floor between).
const cases = (process.env.CLOUD_CASES || '0,1,2,3,4,-3,-4').split(',').map(Number);
const repeats = Number(process.env.CLOUD_REPEATS || 2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function command(line) { fs.writeFileSync(consolePath, line + '\n'); await sleep(200); }

const bot = mineflayer.createBot({ host: '127.0.0.1', port, username, version: '26.1', auth: 'offline' });
bot.once('spawn', async () => {
  const results = [];
  try {
    await sleep(2000);
    await command(`gamemode survival ${username}`); await command('difficulty normal');
    for (let r = 0; r < repeats; r++) for (const [i, k] of cases.entries()) {
      const X = 1000 + i * 20 + r * 200, cloudY = 151, feet = cloudY + k;
      await command(`forceload add ${X - 4} -4 ${X + 4} 4`); await sleep(1500);
      await command(`fill ${X - 4} 140 -4 ${X + 4} 165 4 air`);
      await command(`fill ${X - 3} 150 -3 ${X + 3} 150 3 glass`);
      const bx = X + 1;
      if (k >= 1) await command(`fill ${bx} 151 0 ${bx} ${feet - 1} 0 glass`);
      if (k < 0) await command(`setblock ${bx} ${feet - 1} 0 glass`);
      // An open pit under the cloud (note 2056): no floor between the body and the cloud over it, as in a hole dug at
      // the fountain. CLOUD_OPEN=1 opens the floor's cell over the body and the column between.
      if (k < 0 && process.env.CLOUD_OPEN === '1') await command(`fill ${bx} ${feet} 0 ${bx} 150 0 air`);
      await command(`effect clear ${username}`);
      await command(`tp ${username} ${bx + .5} ${feet} 0.5`);
      await sleep(1500);
      await command(`effect give ${username} minecraft:instant_health 1 10`);
      await sleep(1200);
      const h0 = bot.health, y0 = bot.entity.position.y;
      let low = h0;
      const watch = () => { low = Math.min(low, bot.health); };
      bot.on('health', watch);
      await command(`summon area_effect_cloud ${X + .5} ${cloudY} 0.5 {Radius:${Number(process.env.CLOUD_RADIUS || 3).toFixed(1)}f,Duration:40,WaitTime:0,ReapplicationDelay:20,potion_contents:{potion:"minecraft:harming"}}`);
      await sleep(400);
      const cloud = Object.values(bot.entities).find(e => e.name === 'area_effect_cloud');
      await sleep(2600);
      bot.off('health', watch);
      await command('kill @e[type=minecraft:area_effect_cloud]');
      await command(`forceload remove ${X - 4} -4 ${X + 4} 4`);
      const row = { k, repeat: r, feetY: Number(y0.toFixed(2)), cloudY: cloud ? Number(cloud.position.y.toFixed(2)) : null, health: h0, lost: Math.round((h0 - low) * 10) / 10 };
      results.push(row); console.log(JSON.stringify(row));
      if (bot.health <= 0) { await sleep(3000); }
    }
  } catch (err) { console.log(JSON.stringify({ error: String(err.message || err) })); }
  const by = {};
  for (const r of results) (by[r.k] ||= []).push(r.lost);
  console.log(`[cloud drill] health lost by the feet's height over the cloud: ${Object.entries(by).sort((a, b) => b[0] - a[0]).map(([k, l]) => `${k > 0 ? '+' : ''}${k}: ${l.join(', ')}`).join('; ')}`);
  bot.quit(); setTimeout(() => process.exit(0), 500);
});
bot.on('death', () => console.log(JSON.stringify({ death: true })));
bot.on('kicked', r => { console.log(JSON.stringify({ kicked: String(r) })); process.exit(1); });
bot.on('error', e => { console.log(JSON.stringify({ error: String(e.message || e) })); });
