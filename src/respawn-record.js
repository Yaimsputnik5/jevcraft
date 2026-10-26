'use strict';
// The run's own record of this respawn point (note 2210): how the lives that began at the bed standing as the respawn
// went. full-7 (25597, 2026-10-26 12:17 to 12:59Z) slept in a bed at (2264, 16, 1284) in a cave, and the six lives
// that began there lasted 5, 19, 6, 9, 5 and 1 minutes, each ending bare within 60 blocks of it (zombie, spider,
// zombie, skeleton, skeleton, creeper); the questions after each respawn (what to do first, the bed, the drops) said
// nothing of it. Read from the survival state's deaths and its respawn/spawnBed; null with no death since the bed.
function respawnSays(state, now = Date.now()) {
  const bed = state?.respawn || (state?.spawnBed?.foot ? { ...state.spawnBed.foot, dimension: 'overworld' } : null);
  const since = state?.spawnBed?.at ? Date.parse(state.spawnBed.at) : null;
  if (!bed || !Number.isFinite(since)) return null;
  const deaths = (state.deaths || []).filter(d => d?.at && Date.parse(d.at) > since).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!deaths.length) return null;
  const lives = []; let start = since;
  for (const d of deaths) { lives.push(Math.max(1, Math.round((Date.parse(d.at) - start) / 60000))); start = Date.parse(d.at); }
  const off = deaths.map(d => d.position ? Math.round(Math.hypot((d.position.x || 0) - bed.x, (d.position.z || 0) - bed.z)) : null).filter(n => n !== null);
  const bare = deaths.filter(d => Array.isArray(d.worn) ? d.worn.length === 0 : d.worn == null).length;
  const about = {};
  for (const d of deaths) for (const m of (d.about || []).filter(m => (m.distance ?? 99) <= 8)) about[m.name] = (about[m.name] || 0) + 1;
  const aboutSays = Object.entries(about).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, k]) => `${n.replace(/_/g, ' ')} ${k}`).join(', ');
  const minutes = Math.round((now - since) / 60000);
  return `Since this bed at (${bed.x}, ${bed.y}, ${bed.z}) became the respawn ${minutes} minutes ago the bot has died ${deaths.length} time${deaths.length === 1 ? '' : 's'}: the lives from it lasted ${lives.join(', ')} minute${lives.length === 1 ? '' : 's'}${off.length ? `, each ending ${Math.min(...off)} to ${Math.max(...off)} blocks from the bed` : ''}${bare ? `, ${bare === deaths.length ? 'every one' : bare} with nothing worn` : ''}${aboutSays ? `; within eight blocks at the deaths: ${aboutSays}` : ''}. A respawn comes back here, to the same ground and whatever stands on it.`;
}
module.exports = { respawnSays };
