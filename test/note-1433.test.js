'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { spanSteps } = require('../src/end-combat');

test('the span to the island from the entry platform has steps for the cells already laid and the stretch beyond (note 1433)', () => {
  // The platform's cell (98, 49, 0), the island's stone at (89, 48, 8): twelve cells of span stood, two to lay.
  assert.equal(spanSteps(new Vec3(98.5, 49, 0.5), new Vec3(89, 48, 8), 12), 12 + 17);
  assert.ok(spanSteps(new Vec3(98.5, 49, 0.5), new Vec3(89, 48, 8), 12) > 14, 'more than the twelve walked and the two laid');
  assert.equal(spanSteps(new Vec3(91.5, 49, 5.5), new Vec3(89, 48, 8), 12), 12 + 5);
});
