'use strict';
// Note 2202: the healing facts say how many hits are left. 25599 (2026-10-26
// 11:33:49Z) at 4.1 health, iron chestplate, a blaze 4 blocks off, was asked
// the shot question with 'health does not come back' and took keep_on: one
// fireball ended it. 25591 at 2.3 among seven blazes took the fight.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { Vec3 } = require('vec3');
const registry = require('minecraft-data')('26.1');
const { healingSays, hitsLeftSays } = require('../src/healing');

const item = (name, count = 1) => ({ name, count, type: registry.itemsByName[name].id, durabilityUsed: 0 });
function bot({ health, worn = {}, entities = {} }) {
  const slots = [];
  for (const [slot, name] of Object.entries({ 5: worn.head, 6: worn.torso, 7: worn.legs, 8: worn.feet })) if (name) slots[slot] = item(name);
  return Object.assign(new EventEmitter(), { registry, health, food: 17, foodSaturation: 0, entity: { id: 1, position: new Vec3(0.5, 64, 0.5), height: 1.8, width: 0.6, onGround: true },
    game: { dimension: 'the_nether', gameMode: 'survival', difficulty: 'normal' }, time: { timeOfDay: 6000 }, inventory: { items: () => [], slots }, entities, world: { raycast: () => null },
    blockAt: p => ({ name: p.y < 64 ? 'netherrack' : 'air', boundingBox: p.y < 64 ? 'block' : 'empty', position: p }) });
}
const blaze = (id, x) => ({ id, name: 'blaze', type: 'hostile', position: new Vec3(x, 65, 0.5), isValid: true, height: 1.8 });

test('25599: 4.1 health in an iron chestplate, a blaze 4 blocks off: the fireball is about 4.3 through the armour, no more hits, the next one ends it', () => {
  const b = bot({ health: 4.1, worn: { torso: 'iron_chestplate' }, entities: { 2: blaze(2, 4.5) } });
  const says = hitsLeftSays(b, 4.1);
  assert.equal(says, "the hardest hit about, the blaze's, is about 4.3 through what is worn and about 5 more of burning after it (a fireball that lands sets the body alight for five seconds, a health a second, through any armour): at 4.1 health the body takes 0 more such hits counting the burn, and the next one ends it");
  assert.equal(healingSays(b, {}).hitsLeft, says, 'carried on the healing facts every fight question has');
});

test('full health with nothing worn and a wither skeleton beside a blaze: the blaze\'s fireball with its burn (10) is the hardest, over the wither skeleton\'s 8 (note 2234)', () => {
  const b = bot({ health: 20, entities: { 2: blaze(2, 6.5), 3: { id: 3, name: 'wither_skeleton', type: 'hostile', position: new Vec3(3.5, 64, 0.5), isValid: true, height: 2.4 } } });
  assert.match(hitsLeftSays(b, 20), /^the hardest hit about, the blaze's, is about 5 through what is worn \(nothing worn\) and about 5 more of burning after it .*: at 20 health the body takes 1 more such hit counting the burn, and the one after ends it$/);
});

test('nothing hostile about: nothing said', () => {
  assert.equal(hitsLeftSays(bot({ health: 5 }), 5), null);
  assert.equal(healingSays(bot({ health: 5 }), {}).hitsLeft, undefined);
});

test('a creeper 15 off and the skeleton that hit the bot 4 s ago: the hardest hit is the creeper\'s, and the skeleton\'s own count is said beside it (note 2211)', () => {
  const b = bot({ health: 8, entities: { 2: { id: 2, name: 'creeper', type: 'hostile', position: new Vec3(15.5, 64, 0.5), isValid: true, height: 1.7 }, 3: { id: 3, name: 'skeleton', type: 'hostile', position: new Vec3(6.5, 64, 0.5), isValid: true, height: 1.99 } } });
  b._hurtBy = { skeleton: Date.now() - 4000 };
  const says = hitsLeftSays(b, 8);
  assert.match(says, /^the hardest hit about, the creeper's, is about 24 through what is worn \(nothing worn\): at 8 health the body takes 0 more such hits, and the next one ends it\. The one hitting the bot now, the skeleton \(its last hit 4 s ago\), lands about 3: at 8 health the body takes 2 more such hits, and the one after ends it$/);
});
