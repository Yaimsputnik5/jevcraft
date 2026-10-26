'use strict';
// Note 2201: shooters out of the client's sight that have been landing hits
// are priced as shooting. full-1 (25591, 2026-10-26 11:33Z) stood a block
// from a blaze spawner with seven blazes within eleven blocks, every one
// 'out of sight' to the ray, took seven hits in twenty seconds (12.4 to 2.3
// health) and was asked its stance with every way at 'about 0 damage over
// about 15 seconds'; it took the fight at the spawner and died.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { threats } = require('../src/danger');
const ce = require('../src/combat-estimate');

function spawnerBot() {
  const blazes = {};
  [[3.2, 65, 0], [-3.3, 66, 1], [0, 66, 3.5], [4, 66, -2], [0, 65, -4.3], [6, 66, 0], [10.6, 66, 2]].forEach(([x, y, z], i) => { blazes[i + 1] = { id: i + 1, name: 'blaze', type: 'hostile', position: new Vec3(x, y, z), height: 1.8, isValid: true }; });
  return { game: { dimension: 'the_nether', gameMode: 'survival', difficulty: 'normal' }, entity: { position: new Vec3(0.5, 64, 0.5) }, entities: blazes,
    time: { timeOfDay: 6000 }, world: { raycast: (from, u, length) => ({ position: from.plus(u.scaled(Math.min(1, length))).floored(), intersect: from.plus(u.scaled(Math.min(1, length))) }) }, health: 2.3 };
}

test('seven blazes out of sight round the spawner, the last hit 10 s ago: every one within its fire\'s reach is a shooter with its line, and the stand is priced in health, not at nought (25591)', () => {
  const bot = spawnerBot();
  assert.ok(threats(bot).every(t => t.visible === false), 'the ray sees none');
  bot._hurtBy = { blaze: Date.now() - 10000 };
  const list = threats(bot);
  assert.equal(list.filter(t => t.visible && t.hitting).length, 7, list.map(t => `${t.distance.toFixed(1)}:${t.visible}`).join(' '));
  const price = ce.stanceCost({ mobs: ce.fightEstimate({ threats: list.map(t => ({ name: 'blaze', distance: t.distance, shoots: true, visible: t.visible !== false })), armour: ['iron_chestplate'], weapon: 'diamond_sword', health: 2.3 }).mobs, seconds: 15, fight: { atOnce: 1, only: m => !m.shoots } });
  assert.ok(price.damage >= 2.3, `the stand's price with seven blazes shooting: ${price.damage}`);
  const unseen = ce.stanceCost({ mobs: ce.fightEstimate({ threats: list.map(t => ({ name: 'blaze', distance: t.distance, shoots: true, visible: false })), armour: ['iron_chestplate'], weapon: 'diamond_sword', health: 2.3 }).mobs, seconds: 15, fight: { atOnce: 1, only: m => !m.shoots } });
  assert.equal(unseen.damage, 0, 'what the question said before: nought');
});

test('the same seven with the last hit 25 s ago, or a biter\'s kind: not named by this rule', () => {
  const bot = spawnerBot();
  bot._hurtBy = { blaze: Date.now() - 25000 };
  assert.ok(threats(bot).every(t => !t.hitting));
  bot._hurtBy = { zombie: Date.now() - 1000 };
  assert.ok(threats(bot).every(t => !t.hitting));
});
