'use strict';
// full-3 (2026-10-23 11:27Z): its cave bed taken by a creeper, it came back to life 1500 blocks off at the world spawn
// with the bed still on its record (note 2045).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { EventEmitter } = require('node:events');

function bot(at) {
  return Object.assign(new EventEmitter(), { game: { dimension: 'overworld', gameMode: 'survival' }, entity: { position: at, onGround: true }, entities: {}, health: 20, food: 20,
    time: { timeOfDay: 1000 }, registry: require('minecraft-data')('26.1'),
    blockAt: p => ({ name: p.y < Math.floor(at.y) ? 'grass_block' : 'air', boundingBox: p.y < Math.floor(at.y) ? 'block' : 'empty', position: p }) });
}
const bed = () => ({ name: 'white_bed', foot: { x: 1353, y: -8, z: 1169 }, head: { x: 1354, y: -8, z: 1169 } });

test('back to life far from the bed slept in, after a death: the bed is off the record, the respawn the world spawn', async () => {
  const { settleAfterJoin } = require('../src/lava-escape');
  const b = bot(new Vec3(151.5, 66, -125.5)), lines = [];
  const survival = { bot: b, state: { spawnBed: bed(), recovery: { status: 'pending' } } };
  const facts = await settleAfterJoin(b, survival, { log: l => lines.push(l) });
  assert.equal(survival.state.spawnBed, undefined);
  assert.ok(facts.spawnBedGone && facts.spawnBedGone.off > 1500, JSON.stringify(facts.spawnBedGone));
  assert.ok(lines.some(l => /the bed is gone or blocked, and the respawn is the world spawn now/.test(l)), lines.join(' | '));
});

test('back at the bed after a death, or rejoining far from it with no death: the bed stays', async () => {
  const { settleAfterJoin } = require('../src/lava-escape');
  const atBed = { bot: null, state: { spawnBed: bed(), recovery: { status: 'pending' } } };
  await settleAfterJoin(bot(new Vec3(1353.5, -8, 1170.5)), atBed, { log: () => {} });
  assert.ok(atBed.state.spawnBed, 'came back at the bed');
  const rejoin = { bot: null, state: { spawnBed: bed(), recovery: { status: 'finished' } } };
  await settleAfterJoin(bot(new Vec3(151.5, 66, -125.5)), rejoin, { log: () => {} });
  assert.ok(rejoin.state.spawnBed, 'a reconnect away from the bed with no death says nothing of it');
});
