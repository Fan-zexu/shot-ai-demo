import assert from 'node:assert/strict';
import test from 'node:test';

import { parseByteRange } from '../src/report/range.ts';

test('byte ranges support bounded, open-ended, and suffix requests', () => {
  assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5, length: 4 });
  assert.deepEqual(parseByteRange('bytes=7-', 10), { start: 7, end: 9, length: 3 });
  assert.deepEqual(parseByteRange('bytes=-4', 10), { start: 6, end: 9, length: 4 });
  assert.equal(parseByteRange(undefined, 10), null);
});

test('unsatisfiable and multi-range requests are rejected', () => {
  assert.throws(() => parseByteRange('bytes=10-', 10), /RANGE_NOT_SATISFIABLE/);
  assert.throws(() => parseByteRange('bytes=1-2,4-5', 10), /RANGE_NOT_SATISFIABLE/);
  assert.throws(() => parseByteRange('bytes=-0', 10), /RANGE_NOT_SATISFIABLE/);
});
