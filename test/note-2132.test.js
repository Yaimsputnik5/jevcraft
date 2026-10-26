'use strict';
// Note 2132: a wood, pickaxe or block errand is measured by its own gain
// (the wood, the pickaxe, the blocks carried), not the rung's alone: full-7's
// stem fetches were ended 'no yield ... no ender pearl' on the way to stems.
const test = require('node:test');
const assert = require('node:assert/strict');
const { errandParts, yieldLook } = require('../src/intention');

const bot = items => ({ inventory: { items: () => items }, entity: { position: { x: 0, y: 64, z: 0 } } });

test('a stem fetch is measured by wood and pickaxes carried; a pearl stalk is not', () => {
  const p = errandParts(bot([{ name: 'crimson_stem', count: 2 }, { name: 'stick', count: 3 }, { name: 'stone_pickaxe', count: 1 }]), { q: 'upkeep', choice: 'fetch_stems' });
  assert.deepEqual(p, { 'items:wood': { v: 10, what: "wood, by planks' worth" }, 'items:pickaxe': { v: 1, what: 'pickaxe' } });
  assert.deepEqual(errandParts(bot([]), { q: 'pearl_order', choice: 'stalk_mob' }), {});
  assert.deepEqual(errandParts(bot([{ name: 'netherrack', count: 12 }]), { q: 'rung_progress', choice: 'block_reserve' }), { 'items:blocks': { v: 12, what: 'block to lay' } });
  assert.ok(errandParts(bot([]), { q: 'nether_gather', choice: 'leg_north' })['items:wood'], 'the Nether gather for wood counts wood');
});

test('a stem cut on the fetch is a gain that starts the clock again', () => {
  const items = [{ name: 'stick', count: 3 }];
  const b = bot(items), goal = {}, i = { q: 'upkeep', choice: 'fetch_stems', at: 1000 };
  const y0 = yieldLook(b, goal, i, 1000);
  assert.equal(y0.gainAt, 1000);
  assert.equal(yieldLook(b, goal, i, 61000).gainAt, 1000, 'nothing gained yet');
  items.push({ name: 'crimson_stem', count: 1 });
  const y = yieldLook(b, goal, i, 62000);
  assert.equal(y.gainAt, 62000, 'the stem is the errand\'s own gain');
  assert.equal(y.gains, 1);
});
