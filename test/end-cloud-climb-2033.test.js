'use strict';
// full-3 (2026-10-22 17:39Z): the tunnel to a pillar's foot done, the climb begun under a breath cloud 3 over the
// feet and 1.6 off, cut by it at once; no way out of the pit, dead in full iron (note 2033).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const registry = require('prismarine-registry')('26.1');

test("the climb from a tunnel's end waits for a breath cloud over the column to clear", () => {
  const { cloudOverClimb } = require('../src/end-combat');
  const idx = registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius');
  const cloud = (x, y, z, r) => { const metadata = []; metadata[idx] = r; return { name: 'area_effect_cloud', isValid: true, position: new Vec3(x, y, z), metadata }; };
  const bot = { registry, entity: { position: new Vec3(-8.5, 60, -35.5) }, entities: { 1: cloud(-8, 63, -34, 5.7) } };
  assert.ok(cloudOverClimb(bot), "full-3's cloud: 3 over the feet, 1.6 off");
  bot.entities = { 1: cloud(-8, 63, -14, 3) };
  assert.equal(cloudOverClimb(bot), null, 'twenty off: not over the climb');
  bot.entities = { 1: cloud(-8, 70, -34, 5.7) };
  assert.equal(cloudOverClimb(bot), null, 'ten over: out of the climb');
});

// full-2 (2026-10-23 04:14Z): in its hole at (15, 61, 9) under a cloud at 63, dig_to_sky climbed into it (note 2040).
test('the dig to the sky reads a cloud over the whole climb, and the lowest first', () => {
  const { cloudOverClimb } = require('../src/end-combat');
  const idx = registry.entitiesByName.area_effect_cloud.metadataKeys.indexOf('radius');
  const cloud = (x, y, z, r) => { const metadata = []; metadata[idx] = r; return { name: 'area_effect_cloud', isValid: true, position: new Vec3(x, y, z), metadata }; };
  const bot = { registry, entity: { position: new Vec3(15.5, 61, 9.5) }, entities: { 1: cloud(15.2, 66, 9.4, 3.2) } };
  assert.equal(cloudOverClimb(bot), null, 'five over: out of the short climb');
  assert.equal(cloudOverClimb(bot, 5 + 2)?.position.y, 66, 'in the way of a dig up through five of rock');
  assert.equal(cloudOverClimb(bot, 2 + 2), null, 'over the top of a dig through two');
  bot.entities[2] = cloud(15.2, 63, 9.4, 3.2);
  assert.equal(cloudOverClimb(bot, 9).position.y, 63, 'the lowest cloud over the column');
});
