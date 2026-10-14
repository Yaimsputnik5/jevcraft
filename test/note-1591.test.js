'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { headInBlock, suffocatingBlock, needsAir } = require('../src/vitals');

function bot(blockName) {
  return { entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62, width: 0.6 }, oxygenLevel: 20, blockAt: p => ({ name: blockName, boundingBox: 'block', position: p.floored() }) };
}

test('a hurt that something living gave is not the wall\'s: the head is not in a block (note 1591)', () => {
  const b = bot('end_stone');
  b._recentHurtAt = Date.now(); b._hurtBy = { ender_dragon: Date.now() };
  assert.equal(headInBlock(b), false);
  assert.equal(needsAir(b), false);
});

test('a hurt with no living source and stone at the eye is the wall\'s', () => {
  const b = bot('end_stone');
  b._recentHurtAt = Date.now(); b._hurtBy = { enderman: Date.now() - 60000 };
  assert.equal(headInBlock(b), true);
});

test('iron bars at the eye do not smother (note 1591)', () => {
  const b = bot('iron_bars');
  assert.equal(suffocatingBlock(b), null);
  b._recentHurtAt = Date.now();
  assert.equal(headInBlock(b), false);
});
