'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Note 2113: a walk back for the same drops that ended in a death is said on every way.
test('a death on the walk back for the same drops is said: where, to what, with what about and what worn (note 2113)', () => {
  const { triedDeathsSays } = require('../src/corpse-run');
  const now = Date.parse('2026-10-25T23:50:05Z');
  const bot = { entity: { position: { x: 40, y: 10, z: 206 } }, _survivalState: { deaths: [
    { at: '2026-10-25T23:25:52Z', position: { x: -152, y: 62, z: 190 }, cause: 'was shot by Skeleton', worn: ['iron_helmet'] },
    { at: '2026-10-25T23:49:50Z', position: { x: 1, y: 97, z: 161 }, cause: 'was slain by Spider', worn: [], about: [{ name: 'spider', distance: 2 }, { name: 'zombie', distance: 3 }] } ] } };
  assert.equal(triedDeathsSays(bot, { deathAt: '2026-10-25T23:25:52Z' }, now), ' Since these were dropped, a walk back for them ended in a death: 1 minute ago at (1, 97, 161), 60 blocks from here, slain by Spider, with a spider 2 blocks off, a zombie 3 blocks off, with no armour on.');
  assert.equal(triedDeathsSays(bot, { deathAt: '2026-10-25T23:49:50Z' }, now), '');
});
