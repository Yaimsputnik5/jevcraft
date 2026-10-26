'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { dragonNow, endDecisionState } = require('../src/decisions/end-state');

test('the landing by the fountain is said with the record, the circling and the far bot are not (note 1609)', () => {
  const landing = { phase: 3, position: { x: -1.8, y: 66.5, z: -0.5 } };
  const near = { x: 4.5, y: 62, z: -10.7 };
  const said = dragonNow(landing, near);
  assert.match(said, /coming down to land on the fountain now, 12 blocks off, and the bot stands 12 blocks from the fountain/);
  assert.match(said, /dragon-121, 130, 136 and 149/);
  assert.match(dragonNow({ phase: 4, position: { x: 0, y: 70, z: 0 } }, near), /taking off from the fountain now/);
  assert.equal(dragonNow({ phase: 0, position: { x: 40, y: 90, z: 0 } }, near), undefined);
  assert.equal(dragonNow(landing, { x: 35, y: 82, z: -27 }), undefined);
  const state = endDecisionState({ request: 'beat the game', health: 20, food: 20, arrows: 0, position: near, safe: true, dragon: landing, head: null, crystals: [], combat: { shots: [] } });
  assert.match(state.dragonNow, /coming down to land/);
  assert.equal(state.dragon.phaseName, 'landing');
});

test('the sitting dragon and the bot within twelve of the fountain: the take-off throw said on every option, with dragon-308 (note 2205)', () => {
  const { dragonNow } = require('../src/decisions/end-state');
  const sitting = { phase: 6, position: { x: 0.5, y: 65, z: 0.5 } };
  assert.match(dragonNow(sitting, { x: 1.4, y: 61, z: -0.6 }), /^the dragon sits on the fountain now, its middle 1 blocks off, and the bot stands 2 blocks from the fountain's middle, where its body is: it takes off within seconds .* dragon-308 \(2026-10-26 12:01Z, 20 health\) stood 1\.5 from the middle under the sitting body and was thrown 26 blocks up, dead of the fall/);
  assert.equal(dragonNow(sitting, { x: 14.5, y: 64, z: 0.5 }), undefined, 'fourteen off: not under it');
  assert.match(dragonNow({ phase: 5, position: { x: 0.5, y: 65, z: 0.5 } }, { x: 6, y: 61, z: 0 }), /the sword reaches the head only from the ground 6 to 8 before it\.$/);
});
