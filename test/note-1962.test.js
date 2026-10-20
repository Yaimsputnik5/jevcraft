'use strict';
// Note 1962. An answer that hands the ladder another rung (`takesUp` or
// `takeBack` on its node) is not judged by the ledgers: its run changes
// nothing in the world by design. full-2 (2026-10-20 13:35:29Z, 31 of 80 food
// points) chose take_up_food at the crossing; the rung ledger judged it by the
// rung it left ('nothing gained on the rung: no obsidian or flint and steel'),
// the outcome judge a second later ('changed nothing within 1 second ...
// recorded failed'), the option read 'Tried once ... came to nothing' at the
// next asking, and Jev crossed with the 31; dead fourteen minutes later.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');

const answering = pick => ({ systemOne: async ({ questions }) => {
  const choice = pick(questions.branch_0.criteria);
  return { answers: { branch_0: { choice, confidence: 0.6, probabilities: { [choice]: 0.6 } } } };
} });
const bot = () => ({ entity: { position: new Vec3(-66, 76, 17.5) }, game: { dimension: 'overworld', gameMode: 'survival' },
  inventory: { items: () => [] }, health: 20, food: 20, entities: {}, _stalls: { records: {}, marks: [], marked: 0 } });
const tree = () => ({ cross_now: { description: 'Cross with what is carried now.' },
  take_up_food: { takesUp: 'nether_food', description: 'Take up the food for the Nether again first: 31 of 80 points carried.' } });

test('a take-up answer at the crossing is not ledgered: no tried entry, no outcome watch (note 1962)', async () => {
  const { decide } = require('../src/decisions');
  const b = bot(), goal = { kind: 'win', gameProgress: { phase: 'reach_nether' }, step: { action: 'enter_nether', phase: 'reach_nether' } };
  const d = await decide('crossing_kit', { client: answering(() => 'take_up_food'), bot: b, goal, tree: tree(), state: {} });
  assert.deepEqual(d.path, ['take_up_food']);
  assert.equal((goal.tried?.entries || []).filter(e => e.q === 'crossing_kit').length, 0, 'no rung-ledger entry for the hand-off');
  assert.equal(b._outcome?.crossing_kit, undefined, 'no outcome watch on the hand-off');
});

test('cross_now at the same question is still ledgered (note 1962)', async () => {
  const { decide } = require('../src/decisions');
  const b = bot(), goal = { kind: 'win', gameProgress: { phase: 'reach_nether' }, step: { action: 'enter_nether', phase: 'reach_nether' } };
  await decide('crossing_kit', { client: answering(() => 'cross_now'), bot: b, goal, tree: tree(), state: {} });
  assert.equal((goal.tried?.entries || []).filter(e => e.q === 'crossing_kit').length, 1);
});
