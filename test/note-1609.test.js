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
