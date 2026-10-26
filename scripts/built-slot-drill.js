'use strict';
// The enderman slot's own fight (enderman-slot.js fight) from a slot BUILT on flat ground (the forest trial of 2026-10-26
// 21:17Z died on flat warped nylium where no rock wall gave a slot): a roof over two cells two high, walls on both sides
// and behind, the mouth open, as a rock slot is; endermen about on the flat. Each run: the slot set with fill (as the bot
// would lay it), ArenaJev at its back with an iron sword and iron armour, N endermen summoned 8 to 14 blocks off, the real
// fight for SECONDS; its result line, the kills, the hurt.
//   ARENA_DIR=$HOME/Code/jevcraft/.test-combat MC_PORT=25574 SLOT_RUNS=4 SLOT_MEN=3 node scripts/built-slot-drill.js
const fs = require('fs'), path = require('path');
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const { compatibilityPlugin } = require('../src/compatibility');
const { configureMovements } = require('../src/movement');
const { Task, navigate } = require('../src/skills');
const port = Number(process.env.MC_PORT || 25574);
if ([25565, 25570, 25576, 25577, 25578, 25579].includes(port) || (port >= 25581 && port <= 25610)) throw new Error('The drill needs the arena port');
const consolePath = path.join(process.env.ARENA_DIR || path.join(__dirname, '..', '.test-combat'), 'console.in');
const username = process.env.ARENA_USER || 'ArenaJev';
const RUNS = Number(process.env.SLOT_RUNS || 4), MEN = Number(process.env.SLOT_MEN || 3), SECONDS = Number(process.env.SLOT_SECONDS || 90), FIND = process.env.SLOT_FIND === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function command(line) { fs.writeFileSync(consolePath, line + '\n'); await sleep(250); }
const log = data => console.log(JSON.stringify({ at: new Date().toISOString(), ...data }));
// Ground top at 69; mouth (100, 70, 100); slot cells a (101, 70, 100) and b (102, 70, 100), roof at 72, walls z 99 and 101, back x 103.
const site = { mouth: new Vec3(100, 70, 100), a: new Vec3(101, 70, 100), b: new Vec3(102, 70, 100), d: new Vec3(1, 0, 0), digs: [] };
const bot = mineflayer.createBot({ host: '127.0.0.1', port, username, version: '26.1', auth: 'offline' });
bot.loadPlugin(compatibilityPlugin); bot.loadPlugin(pathfinder);
try { bot.loadPlugin(require('../src/gaze').gazePlugin); } catch (_) { /* no gaze */ }
bot.on('error', e => log({ error: e.message }));
bot.on('kicked', r => log({ kicked: String(r).slice(0, 200) }));
async function run(n) {
  for (const c of ['gamerule doMobSpawning false', 'gamerule doDaylightCycle false', 'time set midnight', 'weather clear', 'difficulty normal', `gamemode survival ${username}`,
    'kill @e[type=enderman]', 'kill @e[type=item]', 'fill 80 60 80 120 69 120 stone', 'fill 80 70 80 120 85 120 air',
    ...(FIND ? [] : ['fill 101 72 100 102 72 100 stone', 'fill 101 70 99 102 71 99 stone', 'fill 101 70 101 102 71 101 stone', 'fill 103 70 100 103 71 100 stone']),
    `item replace entity ${username} armor.head with iron_helmet`, `item replace entity ${username} armor.chest with iron_chestplate`,
    `item replace entity ${username} armor.legs with iron_leggings`, `item replace entity ${username} armor.feet with iron_boots`,
    `clear ${username}`, `give ${username} iron_sword`, ...(FIND ? [`give ${username} netherrack 64`] : []), `effect give ${username} instant_health 1 5`, `effect give ${username} saturation 1 5`,
    (FIND ? `tp ${username} 100.5 70 100.5 90 0` : `tp ${username} 102.5 70 100.5 90 0`)]) await command(c);
  const spots = [[92, 100], [90, 106], [91, 93], [88, 100], [93, 110], [89, 90]];
  for (let i = 0; i < MEN; i++) await command(`summon enderman ${spots[i][0] + 0.5} 70 ${spots[i][1] + 0.5} {PersistenceRequired:1b}`);
  await sleep(1500);
  const sword = bot.inventory.items().find(i => i.name === 'iron_sword'); if (sword) await bot.equip(sword, 'hand').catch(() => {});
  const task = new Task('built_slot_drill', 'the built slot drill');
  const h0 = bot.health, t0 = Date.now();
  let out = null;
  // SLOT_FIND=1: no slot set; the slot found by slotSite on the flat ground (a built one, note 2259) and fought from.
  let use = site;
  if (FIND) { const ES = require('../src/enderman-slot'); const toward = Object.values(bot.entities).find(x => x.name === 'enderman'); use = ES.slotSite(bot, { toward }); log({ run: n, found: use && { mouth: use.mouth, builds: use.builds?.length, material: use.material, line: use.line, out: !!use.out } }); if (!use) { log({ run: n, out: 'no slot found' }); return; } }
  try { out = await require('../src/enderman-slot').fight(bot, task, use, { navigate, seconds: SECONDS, want: MEN, item: 'ender_pearl' }); }
  catch (e) { out = { error: String(e.message || e).slice(0, 160) }; }
  const left = Object.values(bot.entities).filter(x => x.name === 'enderman' && x.isValid !== false).length;
  log({ run: n, men: MEN, seconds: Math.round((Date.now() - t0) / 1000), out, left, botHealth: Math.round(bot.health * 10) / 10, hurt: Math.round((h0 - bot.health) * 10) / 10 });
  await command('kill @e[type=enderman]'); await sleep(1000);
}
bot.once('spawn', async () => {
  await sleep(2000);
  configureMovements(bot);
  try { for (let n = 1; n <= RUNS; n++) await run(n); } catch (e) { log({ failed: String(e.stack || e).slice(0, 400) }); }
  bot.quit(); setTimeout(() => process.exit(0), 1000);
});
