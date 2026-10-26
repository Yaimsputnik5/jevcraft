'use strict';
// Note 2164: full-7 (2026-10-26 07:10:31Z), 7.6 health in cover from 19 blazes, was asked for food with only ways that
// step out of the cover, took one and died seven seconds on. The cover is said, and staying in it is a way.
const test = require('node:test');
const assert = require('node:assert/strict');
const { shooterCover } = require('../src/survival');

const mob = (name, distance, visible) => ({ entity: { name, position: { x: 0, y: 64, z: distance } }, distance, visible });

test('shooters about with no line to the bot are a cover, said with their count, kinds and the nearest', () => {
  const bot = {};
  const threats = () => [mob('blaze', 5.1, false), mob('blaze', 9, false), mob('skeleton', 20, false), mob('zombified_piglin', 3, true)];
  const c = shooterCover(bot, { threats });
  assert.deepEqual({ count: c.count, kinds: c.kinds, nearest: c.nearest }, { count: 3, kinds: 'blaze, skeleton', nearest: 5 });
  assert.equal(c.says, ' In cover now: none of the 3 shooters within 48 blocks (blaze, skeleton; the nearest 5 blocks off) has a line to the bot here, and every way to food begins by stepping out of it into their lines.');
});

test('a shooter with a line, or none about, is no cover', () => {
  assert.equal(shooterCover({}, { threats: () => [mob('blaze', 5, true), mob('blaze', 9, false)] }), null);
  assert.equal(shooterCover({}, { threats: () => [mob('zombified_piglin', 3, false)] }), null);
  assert.equal(shooterCover({}, { threats: () => [] }), null);
});
