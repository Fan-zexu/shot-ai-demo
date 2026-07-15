import assert from 'node:assert/strict';
import test from 'node:test';

import { createTestContext } from './helpers.ts';

test('database enables foreign keys, WAL, and the complete initial schema', (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());

  assert.equal(testContext.database.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(testContext.database.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(testContext.database.pragma('busy_timeout', { simple: true }), 5000);

  const tables = testContext.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);

  for (const table of [
    'comparison_results',
    'comparisons',
    'files',
    'job_events',
    'jobs',
    'motion_artifacts',
    'templates',
  ]) {
    assert.equal(tables.includes(table), true, `${table} should exist`);
  }
});

