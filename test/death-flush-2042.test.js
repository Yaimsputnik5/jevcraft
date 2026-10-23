'use strict';
// full-2 (2026-10-23 06:38:10Z): the death was recorded, the survival store's save waited its 1.5 s, the rejoin read
// the file without it, and the death was never on disk (note 2042).
const test = require('node:test');
const assert = require('node:assert/strict');

test('a death recorded is on disk when the connection closes, before a replacement reads the state', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { EventEmitter } = require('node:events');
  const { Vec3 } = require('vec3');
  const mineflayer = require('mineflayer');
  const { createSession } = require('../src/session');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-death-flush-'));
  const bot = new EventEmitter();
  Object.assign(bot, {
    username: 'Jev', version: '26.1', isAlive: true, health: 20, food: 20,
    registry: require('minecraft-data')('26.1'),
    entity: { id: 1, position: new Vec3(2, 64, 3), yaw: 0, pitch: 0 }, entities: {},
    game: { dimension: 'overworld', gameMode: 'survival' },
    inventory: { items: () => [], slots: [] }, players: { Caller: { username: 'Caller', uuid: 'player-id' } },
    blockAt: () => null, loadPlugin: () => {}, chat: () => {}, respawn: () => {}, quit() { bot.emit('end'); },
  });
  bot._client = new EventEmitter();
  const original = mineflayer.createBot;
  let session;
  try {
    mineflayer.createBot = () => bot;
    session = createSession({ host: 'test', port: 1, username: 'Jev' }, {}, { stateDirectory: directory });
    // A survival save first (the stop pauses it, at once): the death's save after it waits its turn.
    bot._client.emit('playerChat', { sender: 'player-id', plainMessage: 'Jev stop' });
    const file = fs.readdirSync(directory).find(f => f.endsWith('-survival.json'));
    const before = file ? (JSON.parse(fs.readFileSync(path.join(directory, file))).deaths || []).length : 0;
    bot.emit('death');
    bot.emit('end');
    const after = fs.readdirSync(directory).find(f => f.endsWith('-survival.json'));
    assert.ok(after, 'the survival file is written');
    const deaths = JSON.parse(fs.readFileSync(path.join(directory, after))).deaths || [];
    assert.equal(deaths.length, before + 1, 'the death is on disk at the close');
  } finally { try { session?.shutdown(); } catch (_) { /* closed */ } mineflayer.createBot = original; fs.rmSync(directory, { recursive: true, force: true }); }
});
