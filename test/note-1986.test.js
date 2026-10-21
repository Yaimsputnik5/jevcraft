'use strict';
// Note 1986: the walk to a shelter is priced and given time at the pace the
// bot's own walks make, not 4.3 blocks a second and twenty seconds for any.
// full-2 (2026-10-21 06:08:54Z), told 'about 18 seconds at a walk' of a
// shelter 76 blocks off at nightfall, was stopped by the twenty seconds 12
// blocks short of it among four zombies and died in 13 seconds.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { Survival } = require('../src/survival');

const walkWith = (from, to) => {
  const asked = [];
  const self = { bot: { entity: { position: new Vec3(from.x, 64, from.z) }, pathfinder: { movements: {} }, blockAt: () => ({ name: 'stone', boundingBox: 'block' }) },
    actions: { navigate: async (bot, task, goal, opts) => { asked.push(opts.timeoutMs); } } };
  return Survival.prototype.approachRefuge.call(self, { check() {} }, {}, { origin: to }, { x: to.x, y: 64, z: to.z }).then(() => asked[0]);
};

test('a shelter 76 blocks off is given the time a slow walk takes, a near one twenty seconds', async () => {
  const far = await walkWith({ x: -627, z: -1416 }, { x: -559, z: -1450 });
  assert(far >= 35000, `76 blocks given ${far} ms`);
  assert.equal(await walkWith({ x: 0, z: 0 }, { x: 10, z: 0 }), 20000);
});
