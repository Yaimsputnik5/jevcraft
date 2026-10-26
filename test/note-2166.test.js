'use strict';
// Note 2166: a deadly drop beside the feet, said on every way that stands here (full-5, 2026-10-26 07:08Z).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { dropBesideSays, STANDING_WAYS } = require('../src/survival');

// Stone floor at y 63 everywhere but a one-wide chasm east of the feet, two blocks of air then lava at y 60.
function ledgeBot({ health = 18.5, lavaAt = 60, chasmX = 1 } = {}) {
  const blockAt = p => {
    const f = p.floored();
    let name = 'air';
    if (f.y <= 63 && f.x !== chasmX) name = 'netherrack';
    if (f.x === chasmX && f.y === lavaAt) name = 'lava';
    if (f.x === chasmX && f.y < lavaAt) name = 'netherrack';
    return { name, boundingBox: name === 'netherrack' ? 'block' : 'empty', position: f };
  };
  return { health, entity: { position: new Vec3(0.5, 64, 0.5), onGround: true }, blockAt, game: { dimension: 'the_nether' } };
}

test('a drop into lava a block from the feet is said with its depth, the blow that throws and the step back', () => {
  const s = dropBesideSays(ledgeBot());
  assert.match(s, /^ Standing here: a drop of 3 blocks into lava lies 1 block from the feet\. A blow from a mob throws the body about a block \(an enderman's or a hoglin's farther\), and a step back is a block: either can put it over; crouched it cannot step off, but a blow throws it all the same\.$/);
  assert.ok(STANDING_WAYS.includes('cap_fight') && STANDING_WAYS.includes('eat') && STANDING_WAYS.includes('fight'));
});

test('no drop within two blocks, or a shallow one onto ground, is nothing to say', () => {
  assert.equal(dropBesideSays(ledgeBot({ chasmX: 4 })), '', 'the chasm is three blocks off');
  const shallow = ledgeBot({ chasmX: 1 });
  const base = shallow.blockAt;
  shallow.blockAt = p => { const f = p.floored(); if (f.x === 1 && f.y === 62) return { name: 'netherrack', boundingBox: 'block', position: f }; return base(p); };
  assert.equal(dropBesideSays(shallow), '', 'a step down of one block onto ground');
});
