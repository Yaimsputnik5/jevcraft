'use strict';
// The walks to the hole under the dragon's head while it is about, across a stage's runs on this server (note 2217), kept
// as climb-record.js keeps the climbs: begun, met by the dragon's body within thirty seconds (the fall watcher's throw or
// a death), and said on the option. Fable (2026-10-26 12:15Z): check the walk into the landing after ten landings for walks
// over six blocks met in the open. dragon-308 (25589, 12:01Z) walked 20 into a landing, then under the sitting body, thrown
// 26 up; dragon-324 (25592, 13:59Z) walked to its hole's cell as the dragon came down, thrown from (11, 64, 3), dead.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '.bot-state');
const WINDOW_MS = 30000;
function file(bot) { const port = bot._client?.socket?.remotePort || bot._client?.socket?._port || 'default'; return path.join(DIR, `end-landing-walks-${port}.json`); }
function read(bot) { try { const s = JSON.parse(fs.readFileSync(file(bot), 'utf8')); if (s && Number.isFinite(s.walks)) return s; } catch (_) {} return { walks: 0, thrown: 0, deaths: 0, blocks: 0 }; }
function write(bot, s) { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(bot), JSON.stringify(s)); } catch (_) {} }
function hook(bot) { if (bot._landingWalkHooked) return; bot._landingWalkHooked = true; bot.on('death', () => died(bot)); }
function begin(bot, { walk, phase }) {
  hook(bot);
  const s = read(bot); s.walks++; s.blocks += walk || 0; write(bot, s);
  bot._landingWalk = { at: Date.now(), walk, phase, thrown: false };
}
// The body thrown (end-combat.js falling, the dragon's push) within the window of a walk begun.
function thrown(bot) {
  const w = bot._landingWalk; if (!w || w.thrown || Date.now() - w.at > WINDOW_MS) return false;
  w.thrown = true; const s = read(bot); s.thrown++; write(bot, s);
  console.log(`[landing walk] thrown within ${Math.round((Date.now() - w.at) / 1000)} s of the walk of ${w.walk} to the hole under the head (phase ${w.phase}): ${says(bot)}`);
  return true;
}
function died(bot) {
  const w = bot._landingWalk; bot._landingWalk = null;
  if (!w || Date.now() - w.at > WINDOW_MS * 2) return;
  const s = read(bot); s.deaths++; write(bot, s);
  console.log(`[landing walk] died within ${Math.round((Date.now() - w.at) / 1000)} s of the walk of ${w.walk} to the hole under the head: ${says(bot)}`);
}
function says(bot) {
  const s = read(bot);
  if (!s.walks) return 'no walk to the hole with the dragon about has been taken on this server yet';
  return `across this stage's runs on this server ${s.walks} walk${s.walks === 1 ? '' : 's'} to the hole with the dragon about (${Math.round(s.blocks / s.walks)} blocks as a rule): ${s.thrown} met by its body within thirty seconds, ${s.deaths} death${s.deaths === 1 ? '' : 's'} within a minute`;
}
module.exports = { begin, thrown, died, says, read, file };
