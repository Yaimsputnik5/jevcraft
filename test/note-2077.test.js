'use strict';
// A jump over a gap is not refused for lava far under the gap (note 2077):
// full-7 (2026-10-25 01:07Z) chose jump_north off its chest perch over the
// Nether's lava sea and motion refused it, "lava at (-483, 31, 224) ahead;
// not walked into".
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { move } = require('../src/motion');

function perch() {
  const controls = {};
  return {
    entity: { position: new Vec3(0.5, 61, 0.5), yaw: 0, pitch: 0, onGround: true, velocity: new Vec3(0, 0, 0) }, health: 20,
    blockAt: p => { const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
      const name = (x === 0 && y === 60 && z === 0) || (x === 0 && y === 60 && z <= -3) ? 'netherrack' : y <= 31 ? 'lava' : 'air';
      return { name, boundingBox: name === 'netherrack' ? 'block' : 'empty', position: new Vec3(x, y, z), shapes: name === 'netherrack' ? [[0, 0, 0, 1, 1, 1]] : [] }; },
    setControlState: (k, v) => { controls[k] = v; }, getControlState: k => !!controls[k], clearControlStates: () => { for (const k of Object.keys(controls)) controls[k] = false; },
    lookAt: async () => {}, look: async () => {}, controls,
  };
}

test('a sprint jump across a gap is not refused for the lava far under it; a walk the same way is (note 2077)', async () => {
  const logs = [], log = console.log; console.log = m => logs.push(String(m));
  const task = { check() {} };
  try {
    const walk = perch();
    await move(walk, task, { label: 'walk_north', keys: ['forward'], sneak: false, why: 'test', maxMs: 200, tick: 25 });
    assert(logs.some(l => /walk_north: lava at .* ahead; not walked into/.test(l)), logs.join('\n'));
    logs.length = 0;
    const jump = perch();
    let pressed = false;
    await move(jump, task, { label: 'jump_north', keys: ['forward', 'sprint', 'jump'], sneak: false, acrossGap: true, why: 'test', maxMs: 200, tick: 25, until: () => { pressed = pressed || jump.controls.forward; return false; } });
    assert(!logs.some(l => /not walked into/.test(l)), logs.join('\n'));
    assert(pressed, 'the keys went down');
  } finally { console.log = log; }
});
