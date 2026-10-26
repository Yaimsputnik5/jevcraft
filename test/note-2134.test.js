'use strict';
// Note 2134: a stance's mob that has only gone out of sight is said so, not
// 'gone', when the hold is asked again.
const test = require('node:test');
const assert = require('node:assert/strict');
const { begin, diverged } = require('../src/holds');

test('out of sight within twenty-four blocks is not gone', () => {
  const creeper = { id: 7, name: 'creeper' };
  const hold = begin({ choice: 'shield_the_blast', health: 7, mobs: [{ entity: creeper, distance: 5.5, visible: true }] });
  const zombies = [{ entity: { id: 8, name: 'zombie' }, distance: 7.3, visible: true }];
  assert.equal(diverged(hold, { health: 7, mobs: zombies, about: [...zombies, { entity: creeper, distance: 14.7, visible: false }] }),
    'the creeper it was chosen against is out of sight now, 14.7 blocks off: not gone');
  assert.equal(diverged(hold, { health: 7, mobs: zombies, about: zombies }), 'the creeper it was chosen against is gone');
  assert.equal(diverged(hold, { health: 7, mobs: zombies }), 'the creeper it was chosen against is gone', 'without the list, as before');
});
