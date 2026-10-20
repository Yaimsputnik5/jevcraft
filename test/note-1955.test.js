'use strict';
// Note 1955. A shield's uses blocked away are a cost the hold's price does not
// carry: full-3 (2026-10-20 11:39 to 11:42Z) held a pillar 193 seconds under
// one skeleton, the hold extended twice as 'nothing it was chosen on has
// changed', every arrow blocked on the shield, until the shield broke; shot
// dead from 18 health within a minute of that. A hold ends once the shield has
// spent a quarter of the uses it had at the choice, and says so.
const test = require('node:test');
const assert = require('node:assert/strict');
const holds = require('../src/holds');

test('a hold ends once the shield has spent a quarter of its uses on it, and says so (note 1955)', () => {
  const at = Date.now() - 20000;
  const hold = holds.begin({ choice: 'pillar', at, health: 18, expects: { damage: 0, seconds: 15 }, mobs: [], offered: ['pillar', 'fight'], shield: { held: true, left: 200, max: 336 } });
  assert.equal(hold.shieldLeft, 200);
  const base = { health: 18, mobs: [], offered: ['pillar', 'fight'] };
  assert.equal(holds.diverged(hold, { ...base, shield: { held: true, left: 160, max: 336 } }), null, 'forty uses gone is under a quarter of 200');
  assert.equal(holds.diverged(hold, { ...base, shield: { held: true, left: 150, max: 336 } }), 'the shield has taken 50 of its uses on this hold (150 of 336 left, 200 when it was chosen)');
  const bare = holds.begin({ choice: 'pillar', at, health: 18, mobs: [], offered: ['pillar'], shield: { held: false, left: 0, max: 336 } });
  assert.equal(bare.shieldLeft, undefined);
  assert.equal(holds.diverged(bare, { ...base, offered: ['pillar'], shield: { held: false, left: 0, max: 336 } }), null, 'no shield at the choice: nothing to spend');
});
