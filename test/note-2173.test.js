'use strict';
// Note 2173: a death chosen to start over, offered in the Nether with no pickaxe and no block, its cost said.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const RF = require('../src/respawn-fresh');

const botWith = (items, dimension = 'the_nether') => ({ game: { dimension }, entity: { position: new Vec3(0, 64, 0) }, spawnPoint: new Vec3(100, 64, 200), health: 20, inventory: { items: () => items } });

test('offered only in the Nether with no pickaxe, no block and lava known; said with the drops, the respawn and the re-kit record', () => {
  const lava = { distance: 12, at: { x: 10, y: 63, z: 4 } };
  const bare = botWith([{ name: 'blaze_rod', count: 2 }, { name: 'iron_sword', count: 1 }, { name: 'rotten_flesh', count: 3 }]);
  assert.deepEqual(RF.offered(bare, {}, { lava }), { lava });
  assert.equal(RF.offered(botWith([{ name: 'stone_pickaxe', count: 1 }]), {}, { lava }), null, 'a pickaxe carried');
  assert.equal(RF.offered(botWith([{ name: 'netherrack', count: 4 }]), {}, { lava }), null, 'blocks carried');
  assert.equal(RF.offered(botWith([], 'overworld'), {}, { lava }), null, 'not the Overworld');
  assert.equal(RF.offered(bare, {}, { lava: null }), null, 'no lava known');
  const s = RF.says(bare, { survival: { spawnBed: { foot: { x: 5, y: 63, z: 9 } } } }, { lava });
  assert.match(s, /^Die here on purpose and come back to life at the bed at \(5, 63, 9\) in the Overworld: walk into the lava 12 blocks off at \(10, 63, 4\) and stay in it\. Everything carried, 3 stacks \(2 blaze rods, 1 iron sword among them\), drops here and vanishes about five minutes later; nothing is got back\./);
  assert.match(s, /about 73 minutes a death \(40 deaths, 43% of the day's time\)/);
  assert.match(RF.says(bare, {}, { lava }), /the world spawn at \(100, 64, 200\) in the Overworld, with nothing/);
  assert.equal(RF.standing({ deliberateDeath: { at: Date.now() - 1000 } }), true);
  assert.equal(RF.standing({ deliberateDeath: { at: Date.now() - 100000 } }), false);
  assert.equal(RF.standing({}), false);
});
