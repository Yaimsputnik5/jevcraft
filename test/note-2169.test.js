'use strict';
// Note 2169: a standing stance held past twice the seconds it was chosen for is asked again once, said so.
const test = require('node:test');
const assert = require('node:assert/strict');
const holds = require('../src/holds');

test('shield guard past twice its stated seconds is asked again with the hold said; once in five minutes; a pillar is not', () => {
  const t0 = 1_800_000_000_000;
  const hold = holds.begin({ choice: 'shield_guard', at: t0, health: 18, expects: { damage: 1, seconds: 15 }, mobs: [{ entity: { id: 1, name: 'skeleton' }, distance: 12.4, visible: true }] });
  assert.equal(holds.pastStated(hold, { choice: 'shield_guard', at: t0, expects: { damage: 1, seconds: 15 } }, t0 + 29000), null, 'under twice: held on');
  const s = holds.pastStated(hold, { choice: 'shield_guard', at: t0, expects: { damage: 1, seconds: 15 } }, t0 + 31000);
  assert.equal(s, 'held 31 seconds, past twice the 15 seconds it was chosen for, and nothing it was chosen on changed (the skeleton 12 blocks off in sight)');
  assert.equal(holds.pastStated(hold, { choice: 'shield_guard', at: t0, expects: { damage: 1, seconds: 15 } }, t0 + 61000), null, 'asked once in five minutes');
  const again = holds.begin({ choice: 'shield_guard', at: t0 + 40000, health: 18, expects: { damage: 1, seconds: 15 }, mobs: [] });
  const memo = {}; holds.pastStated(hold, { choice: 'shield_guard', at: t0, expects: { damage: 1, seconds: 15 } }, t0 + 31000, memo);
  assert.equal(holds.pastStated(again, { choice: 'shield_guard', at: t0 + 40000, expects: { damage: 1, seconds: 15 } }, t0 + 75000, memo), null, 'the same stance chosen again after the question is not asked for again within five minutes');
  assert.ok(holds.pastStated(hold, { choice: 'shield_guard', at: t0, expects: { damage: 1, seconds: 15 } }, t0 + 331000), 'and again after five minutes');
  const pillar = holds.begin({ choice: 'pillar', at: t0, health: 18, expects: { damage: 0, seconds: 15 }, mobs: [] });
  assert.equal(holds.pastStated(pillar, { choice: 'pillar', at: t0, expects: { damage: 0, seconds: 15 } }, t0 + 120000), null, 'standing is the pillar\'s point');
  assert.equal(holds.pastStated(hold, { choice: 'fight', at: t0, expects: null }, t0 + 120000), null, 'no stated seconds, nothing to be past');
});
