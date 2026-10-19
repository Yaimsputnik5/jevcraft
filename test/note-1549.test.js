'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { straightAway } = require('../src/end-safety');

// Flat ground at 63 (feet at 64) with a block standing one up two cells west, the way away from the dragon east of the bot.
function bot(oneUp) {
  return { blockAt: p => { const f = p.floored(); const solid = f.y <= 63 || (oneUp && f.x === -2 && f.y === 64 && Math.abs(f.z) <= 6); return { name: solid ? 'end_stone' : 'air', boundingBox: solid ? 'block' : 'empty' }; } };
}

test('a cell a block up stops the smooth run; the rough run of three takes it with the jump (note 1549)', () => {
  const start = new Vec3(0.5, 64, 0.5), bearing = 0; // toward the dragon: +x; away is -x
  assert.ok(straightAway(bot(false), start, bearing), 'smooth ground: a run');
  // The step up two cells west, and the same step along every other angle's third cell: nothing smooth within six.
  const b = { blockAt: p => { const f = p.floored(); const r = Math.max(Math.abs(f.x), Math.abs(f.z)); const solid = f.y <= 63 || (f.y === 64 && r === 2); return { name: solid ? 'end_stone' : 'air', boundingBox: solid ? 'block' : 'empty' }; } };
  assert.equal(straightAway(b, start, bearing), null, 'no smooth run of six');
  const rough = straightAway(b, start, bearing, () => true, 3, { rough: true });
  assert.ok(rough, 'the rough run of three');
});

test('a body two blocks over the breath\'s cloud is out of it, and one two under it (note 1568)', () => {
  const { hazardDistance } = require('../src/end-safety');
  const cloud = { name: 'area_effect_cloud', position: new Vec3(0.5, 52, 0.5) };
  assert.ok(hazardDistance(new Vec3(0.5, 52, 0.5), cloud) < 1, 'on its ground: in');
  assert.equal(hazardDistance(new Vec3(0.5, 53, 0.5), cloud), Infinity, 'one up: out (note 1889: the drill lost nothing a block over the cloud)');
  assert.ok(hazardDistance(new Vec3(0.5, 52.4, 0.5), cloud) < 1, 'within half a block over it: in');
  assert.equal(hazardDistance(new Vec3(0.5, 54, 0.5), cloud), Infinity, 'two up: out');
  assert.ok(hazardDistance(new Vec3(0.5, 51, 0.5), cloud) < 1, 'one down: in');
  assert.equal(hazardDistance(new Vec3(0.5, 49.5, 0.5), cloud), Infinity, 'two and a half down: out');
});
