'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { startStallProfiler, summarize } = require('../src/stall-profiler');

function burn(ms) { const t0 = Date.now(); let x = 0; while (Date.now() - t0 < ms) x += Math.sqrt(x + 1); return x; }

test('a stall in the window writes the profile and says its hottest frames (note 1587)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-'));
  const lines = [];
  const p = startStallProfiler({ directory: dir, windowMs: 60000, keepMs: 100, samplingUs: 1000, log: l => lines.push(l) });
  assert.ok(p, 'the profiler started');
  await new Promise(r => setTimeout(r, 150));
  burn(300);
  p.stalled(300);
  await p.flush();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.cpuprofile'));
  assert.equal(files.length, 1, files.join(','));
  const said = lines.find(l => l.startsWith('[stall] 300 ms held'));
  assert.ok(said, lines.join('\n'));
  assert.match(said, /burn test\/stall-profiler\.test\.js:\d+ \d+ ms/);
  await p.stop();
});

test('a quiet window writes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-'));
  const p = startStallProfiler({ directory: dir, windowMs: 60000, log: () => {} });
  await new Promise(r => setTimeout(r, 100));
  await p.flush();
  assert.equal(fs.existsSync(dir) ? fs.readdirSync(dir).length : 0, 0);
  await p.stop();
});

test('summarize ranks self and inclusive frames', () => {
  const profile = { nodes: [{ id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: 0 }, children: [2] }, { id: 2, callFrame: { functionName: 'a', url: 'file:///x/jevcraft/src/a.js', lineNumber: 4 }, children: [3] }, { id: 3, callFrame: { functionName: 'b', url: 'file:///x/jevcraft/src/b.js', lineNumber: 9 } }], samples: [3, 3, 2], timeDeltas: [1000, 1000, 1000] };
  const s = summarize(profile);
  assert.equal(s.self[0], 'b src/b.js:10 2 ms');
  assert.equal(s.inclusive[0], 'a src/a.js:5 3 ms');
});
