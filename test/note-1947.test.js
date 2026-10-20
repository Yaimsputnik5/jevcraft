'use strict';
// Note 1947. The hurt watchdog ("hit with no survival response") stopped the
// body in a stance Jev had just chosen, because stanceHeld lets a stance go
// once six health went (note 793): the pillar's climb, the charge, the
// retreat's run were cut and their step aborted while the arbiter's own
// "health fell" question was going out anyway. Of the four fresh runs' 105
// such stops (2026-10-19/20), 20 came within four seconds of a stance
// answer, 5 of them followed by a death within fifteen seconds. A stance
// whose run is in flight in its first seconds is the answer; a stance done
// running, or run long past its answer, still gives way as note 793 has it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { Survival } = require('../src/survival');
const { groundBot } = require('./fixtures/saved-ground');

function flat() {
  const rows = [], box = { x: [-8, 8], y: [63, 67], z: [-4, 4] };
  for (let y = box.y[0]; y <= box.y[1]; y++) for (let z = box.z[0]; z <= box.z[1]; z++) rows.push(''.padEnd(box.x[1] - box.x[0] + 1, y === 63 ? 'b' : 'a'));
  return { box, palette: ['air', 'stone'], rows };
}
function hurtBot({ stance, health }) {
  const bot = groundBot(flat(), { at: new Vec3(0.5, 64, 0.5), health, food: 20, items: [['cobblestone', 20]],
    mobs: [{ id: 1, name: 'zombie', at: new Vec3(2.5, 64, 0.5), height: 1.95 }] });
  bot.pathfinder = { setGoal() {}, isMoving: () => false }; bot.clearControlStates = () => {}; bot.stopDigging = () => {};
  const survival = new Survival(bot, { place: async () => {}, dig: async () => {}, navigate: async () => {} }, { state: { shelters: [] } });
  bot._stance = stance; bot._survivalGoal = { step: { action: 'mine' } };
  bot.emit('entityHurt', bot.entity, bot.entities[1]);
  return { bot, survival };
}

test('a stance whose run is in flight, chosen a second ago at 20 and hit to 12, is the answer: the body is not stopped (note 1947)', () => {
  const { bot } = hurtBot({ stance: { choice: 'pillar', health: 20, at: Date.now() - 1200, running: true }, health: 12 });
  assert.ok(!bot._threatAbort, 'the pillar climb goes on; the next question is asked with the health as it is');
});

test('a stance done running, its hold past six health, still gives way to the stop (note 793 kept)', () => {
  const { bot } = hurtBot({ stance: { choice: 'pillar', health: 20, at: Date.now() - 3000, ranAt: Date.now() - 2500, running: false }, health: 12 });
  assert.ok(bot._threatAbort, 'nothing is answering the hit: the step is stopped for the survival layer');
});

test('a stance still running six seconds after its answer, six health gone, gives way too', () => {
  const { bot } = hurtBot({ stance: { choice: 'retreat', health: 20, at: Date.now() - 6000, running: true }, health: 12 });
  assert.ok(bot._threatAbort);
});

test('keep_working running is no answer to a hit', () => {
  const { bot } = hurtBot({ stance: { choice: 'keep_working', health: 20, at: Date.now() - 500, running: true }, health: 12 });
  assert.ok(bot._threatAbort);
});
