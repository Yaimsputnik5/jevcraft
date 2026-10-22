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
