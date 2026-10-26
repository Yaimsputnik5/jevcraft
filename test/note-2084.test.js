'use strict';
// Note 2084: the climbs to open sky chosen in the last hour are said at the
// next surface trip, with what they were for and their minutes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { noteClimb, climbsLatelySays } = require('../src/work');

test('climbs of the last hour are counted by need; older ones are not', () => {
  const goal = {}, now = Date.now();
  noteClimb(goal, 'wood (any log)', { up: 22, seconds: 120 }, now - 70 * 60000);
  noteClimb(goal, 'sheep', { up: 19, seconds: 110 }, now - 20 * 60000);
  noteClimb(goal, 'sheep', { up: 21, seconds: 130 }, now - 5 * 60000);
  assert.equal(climbsLatelySays(goal, now), 'In the last hour 2 climbs to open sky were chosen (2 for sheep), about 4 minutes of climbing said for them and 40 blocks up, each leaving the work below and coming back down to it; what is owed at the surface taken in one trip saves the others.');
  assert.equal(climbsLatelySays({}, now), null);
});

test('climb_out says the climbs of the last hour and counts its own once (note 2085)', () => {
  const src = require('fs').readFileSync(require.resolve('../src/surface'), 'utf8');
  assert.match(src, /facts\.climbsLately = lately/);
  assert.match(src, /noteClimb\(goal, goal\.surfaceTrip\?\.need \|\| 'the way up'/);
  assert.match(src, /Date\.now\(\) - c\.at < 3 \* 60000/);
});

test('cooking says the points it gains in the minutes of getting food (note 2101)', () => {
  const { cookTimeSays } = require('../src/work');
  assert.equal(cookTimeSays(28, 76), " The +28 points are about 5 to 7 minutes of getting food at the fresh runs' pace (3.9 to 5.9 food points a minute of hunting and searching); less the 76 seconds here, cooking saves about 3 to 6 minutes of play. Eaten raw, the meat gives a third of it.");
  assert.equal(cookTimeSays(0, 10), '');
});

test('eating raw meat says what it gives up in the cook\'s minutes (note 2109)', () => {
  const { rawCostSays } = require('../src/work');
  assert.equal(rawCostSays({ raw: 'beef', n: 6, now: 18, after: 48 }, 62), ' Eaten raw, all 6 beef carried give 18 of the 48 points they give cooked: the 30 lost are about 5 to 8 minutes of getting food later, where cooking them first takes about 62 seconds.');
  assert.equal(rawCostSays({ raw: 'beef', n: 1, now: 3, after: 3 }, 12), '');
});

test('the crossing kit says what the Nether wears an hour, by the fresh runs, and how long the pickaxes carried last (note 2111)', () => {
  const { netherWearSays } = require('../src/crossing-kit');
  assert.equal(netherWearSays(510), " On the fresh runs (2026-10-24 to 25) the Nether wore about 370 to 690 pickaxe uses an hour of being there: the 510 uses carried last about 44 to 83 minutes at that rate; with none left, rock is dug by hand at about 12 blocks a minute against 40 with a pickaxe, dropping nothing, and a wooden pickaxe of the Nether's stems lasts 59.");
  assert.match(netherWearSays(0), /an hour of being there: with none left/);
});

test('the crossing says the deaths where it comes out in the Nether (note 2112)', () => {
  const { portalDeathsSays } = require('../src/crossing-kit');
  const now = Date.parse('2026-10-25T15:00:00Z');
  const death = (at, x, z, dimension = 'the_nether', cause = 'was slain by Magma Cube') => ({ at, dimension, position: { x, y: 55, z }, cause });
  const bot = { game: { dimension: 'overworld' }, entity: { position: { x: 20, y: 70, z: 190 } }, _survivalState: { deaths: [
    death('2026-10-25T09:27:53Z', -3, 31), death('2026-10-25T10:46:04Z', 1, 23), death('2026-10-25T14:13:48Z', 4, 25),
    death('2026-10-25T12:01:02Z', 4, 25, 'overworld', 'was blown up by Creeper'), death('2026-10-24T09:00:00Z', 2, 24) ] } };
  const goal = { portals: [{ x: 2, y: 55, z: 24, dimension: 'nether' }, { x: 20, y: 70, z: 190, dimension: 'overworld' }] };
  assert.match(portalDeathsSays(bot, goal, now), /^ Where this crossing comes out, the Nether portal at \(2, 55, 24\): 3 deaths within 16 blocks of it in the last 24 hours \(3 slain by Magma Cube\), the nearest 1 blocks from the portal, the last 46 minutes ago;/);
  assert.equal(portalDeathsSays({ ...bot, _survivalState: { deaths: [] } }, goal, now), '');
  assert.equal(portalDeathsSays({ ...bot, game: { dimension: 'the_nether' } }, goal, now), '', 'said only on the Overworld side');
});

test('a climb is noted once: the same need again within ten minutes is the same climb (note 2125)', () => {
  const { noteClimb, climbsLatelySays } = require('../src/work');
  const now = Date.now(), goal = {};
  noteClimb(goal, 'wood (any log)', { up: 40, seconds: 120 }, now - 9 * 60000);
  for (let i = 0; i < 8; i++) noteClimb(goal, 'wood (any log)', { up: 40, seconds: 120 }, now - 9 * 60000 + i);   // eight in a second
  noteClimb(goal, 'wood (any log)', { up: 40, seconds: 120 }, now - 6 * 60000);                                    // the same climb, three minutes on
  noteClimb(goal, 'sheep', { up: 40, seconds: 120 }, now - 5 * 60000);                                             // another need: another climb
  noteClimb(goal, 'wood (any log)', { up: 40, seconds: 120 }, now);                                                // wood again, 9 minutes after the first note but a sheep climb between: a new one
  assert.equal(goal.climbLog.length, 3);
  assert.match(climbsLatelySays(goal, now), /^In the last hour 3 climbs to open sky were chosen \(2 for wood \(any log\), 1 for sheep\)/);
});
