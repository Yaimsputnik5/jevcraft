'use strict';
// The sword at the perched head from the ground, across a stage's runs on this server (note 2228), kept as climb-record.js
// keeps the climbs: the stands begun (under_head's run or strike_head), the swings and the blows landed (the dragon's
// health read after each), the kills ([Free the End] seen in the chat) and the deaths within a minute of a stand. The
// first End-stage kill (25589, trial 323, 2026-10-26 15:31Z) was this: strike_head picked 1470 times, 187 health in 7.8
// minutes after the last crystal; the 25 trials that died that day struck from holes (0 landed in 32) or shot arrows.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '.bot-state');
function file(bot) { const port = bot._client?.socket?.remotePort || bot._client?.socket?._port || 'default'; return path.join(DIR, `end-perches-${port}.json`); }
function read(bot) { try { const s = JSON.parse(fs.readFileSync(file(bot), 'utf8')); if (s && Number.isFinite(s.stands)) return s; } catch (_) {} return { stands: 0, swings: 0, landed: 0, kills: 0, deaths: 0 }; }
function write(bot, s) { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(bot), JSON.stringify(s)); } catch (_) {} }
function hook(bot) {
  if (bot._perchRecordHooked) return; bot._perchRecordHooked = true;
  bot.on('death', () => { const w = bot._perchStand; bot._perchStand = null; if (w && Date.now() - w.at < 60000) { const s = read(bot); s.deaths++; write(bot, s); } });
  bot.on('message', m => { try { if (/Free the End/.test(String(m?.toString?.() ?? m))) { const s = read(bot); s.kills++; write(bot, s); console.log(`[perch record] the dragon killed: ${says(bot)}`); } } catch (_) {} });
}
function begin(bot, how) { hook(bot); const s = read(bot); s.stands++; write(bot, s); bot._perchStand = { at: Date.now(), how }; }
function swing(bot, { landed = false } = {}) { const s = read(bot); s.swings++; if (landed) s.landed++; write(bot, s); }
function says(bot) {
  const s = read(bot);
  if (!s.stands) return 'no stand at the perched head from the ground on this server yet';
  return `across this stage's runs on this server ${s.stands} stand${s.stands === 1 ? '' : 's'} at the perched head from the ground: ${s.swings} swing${s.swings === 1 ? '' : 's'}, ${s.landed} landed by the dragon's health, ${s.kills} kill${s.kills === 1 ? '' : 's'}, ${s.deaths} death${s.deaths === 1 ? '' : 's'} within a minute of a stand`;
}
module.exports = { begin, swing, says, read, file };
