'use strict';
// The deaths near a place, said where the place is chosen (note 2123): the
// bed slept in, the home walked to for the night, the bed left as the respawn.
// full-4's bed stood at (-1191, 67, 279) with a river beside it; drowned with
// tridents killed it 3 and 39 blocks from the bed on 2026-10-26 (01:10 and
// 01:24Z), and no question about the home or the bed said so.
const HOURS = 24, RADIUS = 48;
function deathsNear(bot, point, { radius = RADIUS, hours = HOURS, now = Date.now() } = {}) {
  const deaths = bot?._survivalState?.deaths || [];
  if (!point || !deaths.length) return [];
  return deaths.filter(d => d?.position && d.at && now - Date.parse(d.at) <= hours * 3600000 && Math.hypot(d.position.x - point.x, d.position.z - point.z) <= radius);
}
const causeOf = d => String(d.cause || 'died').replace(/^was /, '').replace(/ to escape .*$/, '');
function deathsNearSays(bot, point, { what = 'here', radius = RADIUS, hours = HOURS, now = Date.now() } = {}) {
  const near = deathsNear(bot, point, { radius, hours, now });
  if (!near.length) return '';
  const by = {};
  for (const d of near) { const c = causeOf(d); by[c] = (by[c] || 0) + 1; }
  const last = Math.max(...near.map(d => Date.parse(d.at)));
  const ago = Math.round((now - last) / 60000);
  const bare = near.filter(d => !(d.worn || []).some(w => w !== 'shield')).length;
  return ` ${near.length === 1 ? 'A death' : `${near.length} deaths`} within ${radius} blocks of ${what} in the last ${hours} hours: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c}`).join(', ')}${bare ? ` (${bare} with no armour on)` : ''}; the last ${ago < 120 ? `${ago} minutes` : `${Math.round(ago / 60)} hours`} ago. The mobs that spawn by a place come back each night while the place is the same.`;
}
module.exports = { deathsNear, deathsNearSays, HOURS, RADIUS };
