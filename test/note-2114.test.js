'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

// Note 2114: the run from a biter is priced by the ground it would go over,
// read round the feet: a passage or steps, or open ground.
test('the ground round the feet is read: a one-wide staircase is a passage with steps, open ground is open', () => {
  const { runGroundOf } = require('../src/survival');
  // A staircase one wide running +x, each cell a block higher; solid walls on both sides.
  const stair = (p) => {
    const { x, y, z } = p;
    if (z !== 0) return { boundingBox: 'block', name: 'stone' };
    const floorY = 64 + x;
    if (y < floorY) return { boundingBox: 'block', name: 'stone' };
    if (y <= floorY + 1) return { boundingBox: 'empty', name: 'air' };
    return { boundingBox: 'block', name: 'stone' };
  };
  const bot = { entity: { position: new Vec3(0.5, 64, 0.5) }, blockAt: stair };
  const g = runGroundOf(bot, new Vec3(-7, 57, 0.5));
  assert.equal(g.open, 2, 'the cell behind and the cell ahead');
  assert.equal(g.steps, 3, 'three cells on, three up');
  assert.equal(g.climbing, true);
  assert.match(g.says, /^The bot stands in a passage: 2 of the 8 cells beside its feet can be stood on, and the way off from it climbs 3 in the next three cells\. A run along steps goes at their pace, about a block a second/);
  // Open flat ground.
  const flat = (p) => p.y < 64 ? { boundingBox: 'block', name: 'grass_block' } : { boundingBox: 'empty', name: 'air' };
  const g2 = runGroundOf({ entity: { position: new Vec3(0.5, 64, 0.5) }, blockAt: flat }, new Vec3(-7, 64, 0.5));
  assert.equal(g2.open, 8); assert.equal(g2.steps, 0); assert.equal(g2.climbing, false);
  assert.match(g2.says, /^8 of the 8 cells beside the bot's feet can be stood on\. Open ground: a sprint outruns anything that walks\./);
});
