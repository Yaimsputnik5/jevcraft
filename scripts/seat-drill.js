'use strict';
// Where a carried boat can be set down from the hand on dry ground (note 2218): the seat against the dragon's push
// (end-combat.js sit_in_boat) aimed at the top of the floor block one cell from the feet and the server refused it four
// times in dragon-317 ('The boat was not set down'); vanilla's BoatItem.use puts the boat where the look's ray meets a
// block and refuses it when any entity stands in the boat's box, the player included. The drill stands ArenaJev on the
// arena's flat ground, gives it an oak boat, and tries the top of the floor at one, two and three cells, each four times:
// whether a boat appears within a second, and whether it can be boarded.
//   ARENA_DIR=$HOME/Code/jevcraft/.test-combat MC_PORT=25574 node scripts/seat-drill.js
const fs = require('fs'), path = require('path');
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');
const { compatibilityPlugin } = require('../src/compatibility');
const port = Number(process.env.MC_PORT || 25574);
if ([25565, 25570, 25576, 25577, 25578, 25579].includes(port) || (port >= 25581 && port <= 25610)) throw new Error('The seat drill needs the arena port');
const consolePath = path.join(process.env.ARENA_DIR || path.join(__dirname, '..', '.test-combat'), 'console.in');
const username = process.env.ARENA_USER || 'ArenaJev';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function command(line) { fs.writeFileSync(consolePath, line + '\n'); await sleep(200); }
const log = data => console.log(JSON.stringify({ at: new Date().toISOString(), ...data }));
const STAND = { x: 100, y: 70, z: 100 };
const bot = mineflayer.createBot({ host: '127.0.0.1', port, username, version: '26.1', auth: 'offline' });
bot.loadPlugin(compatibilityPlugin);
bot.on('error', e => log({ error: e.message }));
bot.on('kicked', r => log({ kicked: String(r).slice(0, 200) }));
async function stage() {
  for (const line of [`clear ${username}`, `gamemode survival ${username}`, `fill ${STAND.x - 6} ${STAND.y - 1} ${STAND.z - 6} ${STAND.x + 6} ${STAND.y - 1} ${STAND.z + 6} stone`, `fill ${STAND.x - 6} ${STAND.y} ${STAND.z - 6} ${STAND.x + 6} ${STAND.y + 4} ${STAND.z + 6} air`,
    `tp ${username} ${STAND.x + .5} ${STAND.y} ${STAND.z + .5}`]) await command(line);
  await sleep(1500); await bot.waitForChunksToLoad(); await sleep(500);
}
async function trial(cells, i) {
  await command(`kill @e[type=minecraft:oak_boat]`);
  await command(`clear ${username}`); await command(`give ${username} oak_boat 1`);
  await command(`tp ${username} ${STAND.x + .5} ${STAND.y} ${STAND.z + .5}`); await sleep(600);
  const item = bot.inventory.items().find(it => it.name === 'oak_boat'); if (!item) { log({ trial: i, cells, error: 'no boat in hand' }); return; }
  await bot.equip(item, 'hand');
  const target = new Vec3(STAND.x + cells + .5, STAND.y - 0.05, STAND.z + .5); // the top of the floor block `cells` east
  const ids = new Set(Object.keys(bot.entities));
  await bot.lookAt(target, true); await sleep(150);
  bot.activateItem();
  let boat = null; for (let t = 0; t < 20 && !boat; t++) { await sleep(50); boat = Object.values(bot.entities).find(e => !ids.has(String(e.id)) && /boat/.test(e.name || '')); }
  let seated = false, mountErr = null;
  if (boat) { try { bot.mount(boat); for (let t = 0; t < 30 && !bot.vehicle; t++) await sleep(50); seated = !!bot.vehicle; } catch (err) { mountErr = err.message; } }
  log({ trial: i, cells, placed: !!boat, boatAt: boat && { x: Math.round(boat.position.x * 10) / 10, z: Math.round(boat.position.z * 10) / 10 }, seated, mountErr, bodyAt: { x: Math.round(bot.entity.position.x * 10) / 10, z: Math.round(bot.entity.position.z * 10) / 10 } });
  if (bot.vehicle) { try { bot.dismount(); } catch (_) {} await sleep(400); }
}
bot.once('spawn', async () => {
  try {
    await bot.waitForChunksToLoad(); await stage();
    const summary = {};
    for (const cells of [1, 2, 3]) { let placed = 0, seated = 0; for (let i = 0; i < 4; i++) { const before = Object.values(bot.entities).filter(e => /boat/.test(e.name || '')).length; await trial(cells, i); const after = Object.values(bot.entities).filter(e => /boat/.test(e.name || '')).length; placed += after > before ? 1 : 0; } summary[`cells${cells}`] = { placed }; }
    log({ summary });
  } catch (err) { log({ error: String(err.stack || err).slice(0, 400) }); }
  finally { await command(`kill @e[type=minecraft:oak_boat]`); bot.quit(); setTimeout(() => process.exit(0), 500); }
});
