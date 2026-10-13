'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { voidSides, knockedIntoVoid, cloudEdgeCells } = require('../src/end-safety');
const registry = require('prismarine-registry')('26.1');

// The End's entry platform: obsidian five blocks square at y 48, x 98 to 102, z -2 to 2, nothing under or about it.
function platform(at) {
  const on = p => p.y === 48 && p.x >= 98 && p.x <= 102 && p.z >= -2 && p.z <= 2;
  return { registry, game: { dimension: 'the_end' }, entity: { position: at, onGround: true }, entities: {},
    blockAt: p => { const f = p.floored(); return on(f) ? { name: 'obsidian', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' }; } };
}

test('out of the breath on the entry platform, a cell the dragon\'s knock would carry off into the void comes after one it would not (note 1432)', () => {
  const bot = platform(new Vec3(101.9, 49, 0.4));
  // The dragon north-west, as it was: its knock runs south-east.
  const dragon = { id: 20, name: 'ender_dragon', position: new Vec3(80, 70, -30), isValid: true };
  assert.equal(voidSides(bot, new Vec3(102.5, 49, 2.5)), 5, 'the corner');
  assert.equal(voidSides(bot, new Vec3(100.5, 49, 0.5)), 0, 'the platform\'s middle');
  assert.equal(knockedIntoVoid(bot, new Vec3(102.5, 49, 2.5), dragon), true, 'the corner: the void on its far side');
  assert.equal(knockedIntoVoid(bot, new Vec3(99.5, 49, -1.5), dragon), false, 'the north-west cell: the platform behind it');
  // A bridge west along z 0: the knock from a dragon due west runs along it.
  const bridge = platform(new Vec3(91.5, 49, 0.5));
  bridge.blockAt = p => { const f = p.floored(); return f.y === 48 && f.z === 0 && f.x >= 80 && f.x <= 102 ? { name: 'cobblestone', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' }; };
  assert.equal(knockedIntoVoid(bridge, new Vec3(91.5, 49, 0.5), { position: new Vec3(60, 60, 0.5) }), false);
  assert.equal(knockedIntoVoid(bridge, new Vec3(91.5, 49, 0.5), { position: new Vec3(91.5, 60, -20) }), true, 'a dragon to the north knocks it off the side');
  // The cloud over the platform's north-west, as it was: no cell two blocks farther from it but the corner, so one block
  // farther counts, and with the dragon east the edge cell with the platform behind it comes before the corner.
  const radius = registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius');
  const cloud = { id: 30, name: 'area_effect_cloud', position: new Vec3(99.5, 49, -0.5), metadata: { [radius]: 3 } };
  const east = { id: 20, name: 'ender_dragon', position: new Vec3(120, 70, 0.5), isValid: true };
  bot.entities = { 20: east, 30: cloud };
  const cells = cloudEdgeCells(bot, bot.entity.position, cloud);
  assert.ok(cells.length >= 2, `cells out of the cloud: ${cells}`);
  assert.deepEqual([cells[0].x, cells[0].z], [101.5, 2.5], `three sides open before five: ${cells[0]}`);
  // With the dragon north-west every one of them is a knock into the void: the ranking has nothing to prefer, and the corner is as it was.
  bot.entities = { 20: dragon, 30: cloud };
  assert.ok(cloudEdgeCells(bot, bot.entity.position, cloud).every(p => knockedIntoVoid(bot, p, dragon)));
});
