'use strict';
// Note 2268: a past-tries note about the question's own place, which every
// way without a target of its own would carry alike, is said once (placeSays,
// put in the state as triedHere), not on each option.
const test = require('node:test');
const assert = require('node:assert');
const tried = require('../src/tried');

const now = 50_000_000;
const bot = { entity: { position: { x: 0.5, y: 64, z: 0.5 } }, game: { dimension: 'the_nether' }, inventory: { items: () => [] } };
const place = { x: 20, y: 64, z: 0 };
const tree = () => ({ open_slit: { description: 'Open a slit.' }, wait_here: { description: 'Wait here.' } });
const triedWith = (methods, times) => {
  const goal = { tried: { entries: [] } };
  for (const m of methods) for (let k = 0; k < times; k++) tried.record(bot, goal, { q: 'empty_spawner', method: m, target: place, outcome: 'blocked', why: 'came to nothing', now: now - 120000 - k });
  return goal;
};

test('one try each: the note is said once, not on the options', () => {
  const r = tried.read(bot, triedWith(['open_slit', 'wait_here'], 1), 'empty_spawner', tree(), { target: place, now });
  assert.match(r.placeSays, /^Tried once toward the same place/);
  assert.strictEqual(r.tree.open_slit.description, 'Open a slit.');
  assert.strictEqual(r.tree.wait_here.description, 'Wait here.');
});

test('every way resting: the shared rest is said once', () => {
  const r = tried.read(bot, triedWith(['open_slit', 'wait_here'], 2), 'empty_spawner', tree(), { target: place, now });
  assert.ok(r.allResting);
  assert.match(r.placeSays, /Tried 2 times.*It rests 3 minutes more from here\./);
  assert.strictEqual(r.tree.open_slit.description, 'Open a slit.');
});

test('a way not tried has no note: each tried way keeps its own', () => {
  const r = tried.read(bot, triedWith(['open_slit'], 1), 'empty_spawner', tree(), { target: place, now });
  assert.strictEqual(r.placeSays, undefined);
  assert.match(r.tree.open_slit.description, /Tried once toward the same place/);
  assert.strictEqual(r.tree.wait_here.description, 'Wait here.');
});
