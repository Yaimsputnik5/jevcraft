'use strict';
// full-2 (07:54Z), full-3 (11:05Z) and full-4 (13:46Z) of 2026-10-23 had the turn to work 457, 506 and 670 seconds after
// their deaths; near the respawn the drops vanish at 300 (note 2047).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

test('the work\'s turn says the drops waiting and their clock: near, the seconds left; far, that they keep', () => {
  const { dropsWaitSays } = require('../src/corpse-run');
  const now = Date.parse('2026-10-23T13:48:00Z');
  const bot = { game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) } };
  const goal = { corpseRun: { deathAt: '2026-10-23T13:46:36Z', position: { x: 60, y: 30, z: 0 }, dimension: 'overworld', items: { iron_helmet: 1, iron_pickaxe: 1 }, status: 'open' } };
  assert.match(dropsWaitSays(bot, goal, now), /60 blocks off: iron helmet, iron pickaxe\. That ground is loaded about the bot, so they vanish five minutes after the death, about 216 seconds from now\./);
  goal.corpseRun.position.x = 900;
  assert.match(dropsWaitSays(bot, goal, now), /900 blocks off: .*they keep until the bot comes near/);
  goal.corpseRun.status = 'left';
  assert.equal(dropsWaitSays(bot, goal, now), '');
  goal.corpseRun.status = 'open'; goal.corpseRun.position.x = 60;
  assert.equal(dropsWaitSays(bot, goal, now + 400000), '', 'gone by now: nothing said');
});
