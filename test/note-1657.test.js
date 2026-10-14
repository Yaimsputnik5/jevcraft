'use strict';
// Note 1657: water poured at the feet runs off a column's top and carries the
// body down (dragon-192), and the climb out of the breath's cloud is not
// refused for water beside it.
const test = require('node:test');
const assert = require('node:assert');
const { Vec3 } = require('vec3');
const { climbStop } = require('../src/pillar-recovery');
const { runOffSides } = require('../src/end-combat');

function world(solidAt) {
  return { blockAt: p => { const name = solidAt(p); return name ? { name, boundingBox: name === 'water' ? 'empty' : 'block', position: p } : { name: 'air', boundingBox: 'empty', position: p }; } };
}

test('a four-high column top runs off on every side; flat ground on none', () => {
  const column = world(p => (p.x === 0 && p.z === 0 && p.y <= 63) ? 'cobblestone' : (p.y <= 59 ? 'end_stone' : null));
  assert.deepEqual(runOffSides(column, new Vec3(0, 64, 0)), ['east', 'west', 'south', 'north']);
  const flat = world(p => p.y <= 63 ? 'end_stone' : null);
  assert.deepEqual(runOffSides(flat, new Vec3(0, 64, 0)), []);
  // A one-step drop beside is no run-off; two is.
  const step = world(p => p.y <= 62 || (p.y === 63 && p.x <= 0) ? 'end_stone' : null);
  assert.deepEqual(runOffSides(step, new Vec3(0, 64, 0)), []);
  const ledge = world(p => p.y <= 61 || (p.y === 63 && p.x <= 0) || (p.y === 62 && p.x <= 0) ? 'end_stone' : null);
  assert.deepEqual(runOffSides(ledge, new Vec3(0, 64, 0)), ['east']);
});

test('the climb is refused for water beside it, and let through on wet; lava never', () => {
  const wet = world(p => p.y <= 59 ? 'end_stone' : (p.x === 1 && p.y === 61 && p.z === 0 ? 'water' : null));
  const bot = { blockAt: wet.blockAt };
  assert.match(climbStop(bot, new Vec3(0, 60, 0)) || '', /water at 1, 61, 0/);
  assert.equal(climbStop(bot, new Vec3(0, 60, 0), { wet: true }), null);
  const lava = world(p => p.y <= 59 ? 'end_stone' : (p.x === 1 && p.y === 61 && p.z === 0 ? 'lava' : null));
  assert.match(climbStop({ blockAt: lava.blockAt }, new Vec3(0, 60, 0), { wet: true }) || '', /lava at 1, 61, 0/);
});
