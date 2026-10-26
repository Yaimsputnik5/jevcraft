'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

// Note 2121: the depth to mine at is Jev's, with this run's ore per hour by
// depth and the game's placement said.
test('the ore tally lays mining minutes and ore picked up to the depth band stood in, and says the rate', () => {
  const od = require('../src/ore-depth');
  const goal = {};
  let items = [{ name: 'raw_iron', count: 2 }];
  const bot = { entity: { position: new Vec3(0, 30, 0) }, inventory: { items: () => items } };
  od.note(bot, goal, 'mine', 15000);                 // the first note only reads the counts
  items = [{ name: 'raw_iron', count: 7 }];
  for (let i = 0; i < 24; i++) od.note(bot, goal, 'mine', 15000);   // six minutes at y 30, five iron picked up
  assert.equal(goal.oreByDepth.y17to40.ms, 25 * 15000);
  assert.equal(goal.oreByDepth.y17to40.found.raw_iron, 5);
  bot.entity.position = new Vec3(0, 70, 0);
  od.note(bot, goal, 'walk', 15000);                 // a walk at the surface counts no mining time
  assert.equal(goal.oreByDepth.y63up.ms, 0);
  assert.match(od.runSays(goal, 'raw_iron'), /^ On this run, raw iron found per hour of mining and tunnelling, by the depth stood at: y 17 to 40: 48 \(6 min\)\.$/);
  assert.equal(od.runSays({}, 'raw_iron'), '', 'nothing said with under five minutes mined');
  assert.match(od.fleetSays(), /201 to 245 at y 17 to 40, 54 to 82 at y 41 to 62 and 25 to 67 at y 63 and up/);
  assert.match(od.gameSays('raw_iron'), /ten a chunk between y -24 and 56, most at y 16 .* ninety a chunk between y 80 and 384, most at y 232/);
  assert.match(od.gameSays('diamond'), /seven veins a chunk between y -144 and 16, most at y -64/);
  assert.equal(od.bandOf(16).key, 'y16under'); assert.equal(od.bandOf(17).key, 'y17to40'); assert.equal(od.bandOf(63).key, 'y63up');
});

test('the mining_depth question is defined with the two ways', () => {
  const { question } = require('../src/decisions');
  const q = question('mining_depth');
  assert.deepEqual(q.options.map(o => o.key), ['nearest_ore', 'down_to_depth', 'stock_first']);
  assert.equal(q.parent, 'rung_progress');
});
