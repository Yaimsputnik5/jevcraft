'use strict';
// full-2 (2026-10-23 21:57Z): the save at a close and a save under way wrote the same .tmp; the goal file was left
// unparseable and the bot crashed on every start for two hours (note 2051).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

test('a save at once while one is under way leaves one whole file, the newer, and the older does not rename over it', async () => {
  const { GoalStore } = require('../src/objectives');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-store-race-'));
  try {
    const file = path.join(dir, 'g.json'), store = new GoalStore(file);
    store.save({ version: 1, status: 'running', n: 0 });
    store.pending = { version: 1, status: 'running', n: 1, big: 'x'.repeat(200000) };
    const underWay = store.flush();
    store.pending = { version: 1, status: 'running', n: 2 };
    store.flushSync();
    await underWay;
    const read = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(read.n, 2, 'the newer save stands');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['g.json'], 'no temporary file left');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
