'use strict';
// The climbs across a stage's runs, bare and walled, and the deaths on them
// (note 1764): the End resets each run and the fight's own record with it,
// so what the climbs have cost is kept in .bot-state, one file a port, and
// said to Jev on the climb and on the quarry for the walls' blocks. Since
// 2026-10-16 the bare climb was the choice at 16 of 25588's 53 deaths and the
// quarry for the walls was taken 4 times against 73 climbs; the five walled
// climbs so far all reached their crystals at full health.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '.bot-state');
const WINDOW_MS = 240000; // a death this long after the climb began, with no end seen, is the climb's

function file(bot) {
  const port = bot._client?.socket?.remotePort || bot._client?.socket?._port || 'default';
  return path.join(DIR, `end-climbs-${port}.json`);
}
function read(bot) {
  try { const s = JSON.parse(fs.readFileSync(file(bot), 'utf8')); if (s && s.bare && s.walled) return s; } catch (_) {}
  return { bare: { climbs: 0, deaths: 0, struck: 0 }, walled: { climbs: 0, deaths: 0, struck: 0 } };
}
function write(bot, s) {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(bot), JSON.stringify(s)); } catch (_) {}
}
function hook(bot) {
  if (bot._climbRecordHooked) return;
  bot._climbRecordHooked = true;
  bot.on('death', () => died(bot));
}
function begin(bot, { walled, lift, crystal }) {
  hook(bot);
  const s = read(bot), kind = walled ? 'walled' : 'bare';
  s[kind].climbs++; write(bot, s);
  bot._climbNow = { kind, at: Date.now(), lift, crystal };
  console.log(`[climb record] a ${kind} climb of ${lift} to crystal ${crystal} begun: ${says(bot)}`);
}
function end(bot, how = 'down') {
  const c = bot._climbNow; if (!c) return;
  bot._climbNow = null;
  if (how === 'struck') { const s = read(bot); s[c.kind].struck++; write(bot, s); }
  bot._climbLast = { ...c, endedAt: Date.now(), how };
}
function died(bot) {
  const c = bot._climbNow && Date.now() - bot._climbNow.at < WINDOW_MS ? bot._climbNow
    : bot._climbLast && Date.now() - bot._climbLast.endedAt < 30000 ? bot._climbLast : null;
  bot._climbNow = null;
  if (!c) return;
  const s = read(bot); s[c.kind].deaths++; write(bot, s);
  console.log(`[climb record] died on or just off a ${c.kind} climb of ${c.lift} to crystal ${c.crystal}: ${says(bot)}`);
}
function says(bot) {
  const s = read(bot);
  const one = (k, name) => `${s[k].climbs} ${name} climb${s[k].climbs === 1 ? '' : 's'}, ${s[k].deaths} death${s[k].deaths === 1 ? '' : 's'} on them or just off them, ${s[k].struck} crystal${s[k].struck === 1 ? '' : 's'} struck`;
  return `across this stage's runs on this server: ${one('bare', 'bare')}; ${one('walled', 'walled')}`;
}
module.exports = { begin, end, died, says, read, file };
