'use strict';
// Note 2100: the routes price a dug block with the pickaxe it wears (digCost 2).
const test = require('node:test');
const assert = require('node:assert/strict');

test('the bot\'s movements set the dig cost to 2', () => {
  const src = require('fs').readFileSync(require.resolve('../src/movement'), 'utf8');
  assert.match(src, /movement\.digCost = 2;/);
});
