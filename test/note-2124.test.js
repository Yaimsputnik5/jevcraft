'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Note 2124: a fall onto a stalagmite costs twice the fall past half a block
// (the 26.1.2 jar: PointedDripstoneBlock fallOn, fall + 2.5, times 2), where
// plain ground costs the blocks past three.
test('fall damage by the game: ground past three, water nothing, a stalagmite 2 x blocks - 1', () => {
  const { fallDamage, stalagmiteSays, STALAGMITE } = require('../src/terrain');
  assert.equal(fallDamage(3), 0); assert.equal(fallDamage(5), 2); assert.equal(fallDamage(5, 'water'), 0);
  assert.equal(fallDamage(1, 'ground', STALAGMITE), 1); assert.equal(fallDamage(2, 'ground', STALAGMITE), 3); assert.equal(fallDamage(3, 'ground', STALAGMITE), 5); assert.equal(fallDamage(6, 'ground', STALAGMITE), 11);
  assert.match(stalagmiteSays(3), /onto the point of a stalagmite \(pointed dripstone\): a fall onto it costs twice the fall past half a block, about 5 health for these 3, where plain ground costs 0/);
});

test('the dig-down and the drops below read the landing block: a stalagmite under the drop is priced and said', () => {
  const { dropInto, dropBelow } = require('../src/unstuck');
  if (!dropInto || !dropBelow) return;
  const view = { name: p => p.y >= 60 ? 'air' : p.y === 59 ? 'pointed_dripstone' : 'stone', lavaTouch: null, health: 3.6 };
  const { Vec3 } = require('vec3');
  const d = dropInto(view, new Vec3(0, 62, 0));
  assert.equal(d.into, 'ground'); assert.equal(d.landing, 'pointed_dripstone'); assert.equal(d.n, 2);
  assert.match(dropBelow(view, new Vec3(0, 62, 0), { extra: 1 }), /a drop of 2 blocks under it onto the point of a stalagmite .* about 5 health for these 3/);
});
