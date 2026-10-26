'use strict';
// Where the ore is, by this run's own record and by the game (note 2121).
//
// The fresh runs full-5, full-6 and full-7 (2026-10-24 19:45Z to 10-26
// 01:00Z, flight records) found raw iron at 212 to 256 an hour of mining and
// tunnelling at y 17 to 40, 54 to 82 at y 41 to 62 and 25 to 67 at the
// surface (recounted, note 2126), and spent 110 to 252 minutes in each of the two slow bands against
// 22 to 36 in the rich one: the step mined the nearest ore in view wherever
// it stood, and only with none in view went down to the ore's depth (work.js
// mineAtSource, note 1069's thresholds). The depth is Jev's to choose, with
// this run's own rate by depth and the game's placement in front of it.
//
// The game's placement, from the 26.1.2 server jar (data/minecraft/worldgen/
// placed_feature/ore_*.json): iron in veins 10 a chunk between y -24 and 56,
// most at y 16 and fewer toward the ends (ore_iron_middle, a trapezoid), 10
// small veins a chunk anywhere up to y 72 (ore_iron_small), and 90 a chunk
// between y 80 and 384, most at y 232 (ore_iron_upper): where the land rises
// past y 80, iron is far thicker than at y 16. Diamonds 7 veins a chunk
// between y -144 and 16, most at y -64.
const BANDS = Object.freeze([
  { key: 'y16under', label: 'y 16 and under', lo: -64, hi: 16 },
  { key: 'y17to40', label: 'y 17 to 40', lo: 17, hi: 40 },
  { key: 'y41to62', label: 'y 41 to 62', lo: 41, hi: 62 },
  { key: 'y63up', label: 'y 63 and up', lo: 63, hi: 400 },
]);
const ORE_DROPS = ['raw_iron', 'raw_copper', 'raw_gold', 'coal', 'diamond', 'redstone', 'lapis_lazuli', 'emerald'];
const MINING = /^(mine|tunnel|night_mine|branch|acquire|dig_|resource_tunnel)/;
const GAME = Object.freeze({
  iron: 'The game puts iron in veins ten a chunk between y -24 and 56, most at y 16 and fewer toward either end, ten small veins a chunk anywhere up to y 72, and ninety a chunk between y 80 and 384, most at y 232: in land that rises past y 80 iron is far thicker than at y 16.',
  diamond: 'The game puts diamonds in seven veins a chunk between y -144 and 16, most at y -64 and fewer toward either end.',
});
const bandOf = y => BANDS.find(b => y <= b.hi) || BANDS[BANDS.length - 1];
const count = (bot, name) => (bot.inventory?.items?.() || []).filter(i => i.name === name).reduce((n, i) => n + i.count, 0);

// Every TRAIL_EVERY_MS from stillness.js noteTrail: the band's mining time,
// and the ore picked up since the last note, laid to the band stood in.
function note(bot, goal, doing, ms, now = Date.now()) {
  if (!goal || !bot?.entity?.position) return;
  const band = bandOf(Math.floor(bot.entity.position.y)).key;
  const rec = (goal.oreByDepth ||= {}), b = (rec[band] ||= { ms: 0, found: {} });
  if (MINING.test(String(doing || '')) && ms > 0) b.ms += Math.min(ms, 60000);
  const seen = bot._oreCounts || {};
  const nowCounts = {};
  for (const name of ORE_DROPS) {
    const n = count(bot, name); nowCounts[name] = n;
    if (seen[name] !== undefined && n > seen[name]) b.found[name] = (b.found[name] || 0) + (n - seen[name]);
  }
  bot._oreCounts = nowCounts;
}

// This run's rate by band for one drop, where it has mined: "raw iron per hour of mining by depth: y 17 to 40 230 (24 min), ...".
function runSays(goal, drop = 'raw_iron') {
  const rec = goal?.oreByDepth || {};
  const rows = BANDS.map(b => ({ b, r: rec[b.key] })).filter(x => x.r && x.r.ms >= 5 * 60000);
  if (!rows.length) return '';
  const word = drop.replaceAll('_', ' ');
  return ` On this run, ${word} found per hour of mining and tunnelling, by the depth stood at: ${rows.map(({ b, r }) => `${b.label}: ${Math.round((r.found[drop] || 0) / (r.ms / 3600000))} (${Math.round(r.ms / 60000)} min)`).join('; ')}.`;
}
// The fleet's record where the run has none yet (the fresh runs, as above).
// Recounted with the flight record's inventory-less frames skipped (note 2126).
const FLEET = Object.freeze({ runs: 'full-5, full-6 and full-7 (2026-10-24 to 26)', y17to40: '201 to 245', y41to62: '54 to 82', y63up: '25 to 67' });
const fleetSays = () => ` On the fresh runs ${FLEET.runs}, raw iron found per hour of mining was ${FLEET.y17to40} at y 17 to 40, ${FLEET.y41to62} at y 41 to 62 and ${FLEET.y63up} at y 63 and up; they spent most of their mining minutes in the two slower bands.`;
function gameSays(drop) { return drop === 'diamond' ? ` ${GAME.diamond}` : drop === 'raw_iron' ? ` ${GAME.iron}` : ''; }

module.exports = { BANDS, ORE_DROPS, bandOf, note, runSays, fleetSays, gameSays, GAME, FLEET };
