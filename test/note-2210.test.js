'use strict';
// Note 2210: the respawn point's own record. full-7 (25597, 2026-10-26 12:17
// to 12:59Z) slept in a cave bed at (2264, 16, 1284) and the six lives from
// it lasted 5, 19, 6, 9, 5 and 1 minutes, each ending bare within sixty
// blocks of it; nothing after a respawn said so.
const test = require('node:test');
const assert = require('node:assert/strict');
const { respawnSays } = require('../src/respawn-record');

const T0 = Date.parse('2026-10-26T12:17:42Z');
const death = (min, x, z, about, worn = []) => ({ at: new Date(T0 + min * 60000).toISOString(), position: { x, y: 20, z }, dimension: 'overworld', about, worn });
const state = { respawn: { x: 2264, y: 16, z: 1284, dimension: 'overworld' }, spawnBed: { name: 'white_bed', foot: { x: 2264, y: 16, z: 1284 }, at: '2026-10-26T12:17:42Z' },
  deaths: [death(-120, 1512, 379, [{ name: 'skeleton', distance: 2 }], ['iron_helmet']), death(5, 2266, 1302, [{ name: 'zombie', distance: 1 }]), death(24, 2250, 1290, [{ name: 'spider', distance: 2 }]), death(30, 2266, 1302, [{ name: 'zombie', distance: 1 }, { name: 'creeper', distance: 16 }]),
    death(39, 2234, 1278, [{ name: 'skeleton', distance: 7 }]), death(44, 2240, 1275, [{ name: 'skeleton', distance: 9 }]), death(45, 2238, 1280, [{ name: 'creeper', distance: 2 }])] };

test('six lives from the cave bed, each short and bare: said with their minutes, their distance from the bed and what stood about', () => {
  const says = respawnSays(state, T0 + 46 * 60000);
  assert.equal(says, 'Since this bed at (2264, 16, 1284) became the respawn 46 minutes ago the bot has died 6 times: the lives from it lasted 5, 19, 6, 9, 5, 1 minutes, each ending 15 to 31 blocks from the bed, every one with nothing worn; within eight blocks at the deaths: zombie 2, spider 1, skeleton 1, creeper 1. A respawn comes back here, to the same ground and whatever stands on it.');
});

test('no death since the bed was set, or no bed: nothing said', () => {
  assert.equal(respawnSays({ ...state, deaths: state.deaths.slice(0, 1) }), null);
  assert.equal(respawnSays({ deaths: state.deaths }), null);
});

test('the bed question carries the record on every way', () => {
  const { bedAfterSleepTree } = require('../src/survival');
  const bot = { inventory: { items: () => [{ name: 'white_wool', count: 1 }] }, entity: { position: { x: 2265, y: 16, z: 1285 } }, spawnPoint: { x: 2264, y: 16, z: 1284 }, game: { dimension: 'overworld' } };
  const tree = bedAfterSleepTree(bot, state, T0 + 46 * 60000, { goal: {} });
  for (const k of Object.keys(tree)) assert.match(tree[k].description, /Since this bed at \(2264, 16, 1284\) became the respawn 46 minutes ago the bot has died 6 times/, k);
});
