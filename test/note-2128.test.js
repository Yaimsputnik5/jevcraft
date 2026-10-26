'use strict';
// Note 2128: the climb's night is the shelter's night. The survival layer
// wants a shelter from dusk (9500); the climb called it night only from
// 12000, so at dusk a night mine was chosen below and the climb to the
// surface said nothing of the hour and offered no wait for the dawn. And a
// night mine chosen below is said on the climb that leaves it.
const test = require('node:test');
const assert = require('node:assert');
const { nightUpSays, nightMineLeftSays } = require('../src/work');

const bot = (timeOfDay, y = 50) => ({ game: { dimension: 'overworld' }, time: { timeOfDay }, inventory: { slots: {}, items: () => [] }, entity: { position: { x: 0, y, z: 0 } } });

test('at dusk the climb says the dark coming and the dawn; from the dark it says the night as before; by day nothing', () => {
  const dusk = nightUpSays(bot(11579));
  assert.ok(dusk, 'dusk counts');
  assert.match(dusk.climb, /^ It is dusk up there: the dark comes in under a minute, and from then mobs spawn in the open until dawn, about 10 real minutes off; the zombies and skeletons out at dawn burn in the sun\. The bot comes out with/);
  assert.match(dusk.below, /^ Up there dusk is on: the dark comes in under a minute and the night lasts until dawn, about 10 real minutes off; this keeps the bot under the rock meanwhile\.$/);
  assert.equal(dusk.toDawn, 10);
  const early = nightUpSays(bot(9600));
  assert.match(early.climb, /^ It is dusk up there: the dark comes in about 2 real minutes, and from then mobs spawn in the open until dawn, about 11 real minutes off/);
  assert.match(nightUpSays(bot(13000)).climb, /^ It is night up there, about 8 real minutes to dawn: mobs spawn in the open until then/);
  assert.equal(nightUpSays(bot(6000)), null);
  assert.equal(nightUpSays(bot(9400)), null);
});

test('a night mine chosen below is said on the climb, with how long ago, how far, and the record', () => {
  const now = Date.now();
  const goal = { survival: { nightMine: { startedAt: now - 3000, origin: { x: 2, y: 50, z: 0 }, mined: 0 } } };
  assert.match(nightMineLeftSays(bot(11579), goal, now), /^ A night mine was chosen as the night's shelter 3 seconds ago, 2 blocks from here \(0 mined\): this climb leaves it, and the night's shelter is asked again up there\. On 5 fresh runs \(2026-10-26 01:05 to 03:05Z\) 12 of the 27 night mines chosen were left by a climb within three minutes, each a climb and a way back down\.$/);
  goal.nightMinesLeft = 2;
  assert.match(nightMineLeftSays(bot(11579), goal, now), / On this run a climb has left a night mine chosen 2 times so far\. On 5 fresh runs/);
  assert.equal(nightMineLeftSays(bot(11579), { survival: { nightMine: { startedAt: now - 40 * 60000, origin: { x: 0, y: 50, z: 0 } } } }, now), '', 'an old mine says nothing');
  assert.equal(nightMineLeftSays(bot(11579, 90), goal, now), '', 'a mine far from here says nothing');
  assert.equal(nightMineLeftSays(bot(11579), {}, now), '');
});
