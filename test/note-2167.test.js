'use strict';
// Note 2167: what the Nether has cost, said on the fortress approach, its legs and the crossing.
const test = require('node:test');
const assert = require('node:assert/strict');
const nr = require('../src/nether-record');

test('the Nether record names the fleet rate against elsewhere, the fortress swarms, and this run\'s own Nether deaths', () => {
  const goal = { survival: { deaths: [
    { at: '2026-10-26T07:10:38Z', dimension: 'the_nether', cause: 'was burned to a crisp while fighting Blaze', about: [{ name: 'blaze' }, { name: 'blaze' }, { name: 'wither_skeleton' }] },
    { at: '2026-10-26T05:16:00Z', dimension: 'overworld', cause: 'was slain by Zombie', about: [{ name: 'zombie' }] },
    { at: '2026-10-26T01:00:00Z', dimension: 'the_nether', cause: 'tried to swim in lava to escape Ghast', about: [] } ] } };
  const s = nr.says(goal);
  assert.match(s, /^The Nether's record on the six full runs \(2026-10-25 06:00Z to 2026-10-26 07:30Z\): 16 deaths in about 4\.8 bot-hours there, 3\.3 an hour, against 41 in 46 bot-hours elsewhere \(0\.9\); 9 of the 16 came in a fortress with wither skeletons or blazes about, 10 within 26 minutes of entering \(the median 18\)\./);
  assert.match(s, /Three wither skeletons at arm's length took a bot in full iron from 17 to 1 health in six seconds with the shield up/);
  assert.match(s, / Of this run's last 3 deaths, 2 were in the Nether \(burned to a crisp while fighting Blaze; tried to swim in lava to escape Ghast; the mobs about at them: blaze 2, wither skeleton 1\)\.$/);
  assert.match(nr.says({ survival: { deaths: [{ dimension: 'overworld', cause: 'x' }] } }), / Of this run's last 1 death, none was in the Nether\.$/);
  assert.doesNotMatch(nr.says({}), /this run's/);
});
