import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { MotionArtifactSchema } from '../src/index.ts';

test('Python MotionArtifact satisfies the shared TypeBox schema', () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const result = spawnSync(
    resolve(repositoryRoot, '.venv/bin/python'),
    ['tests/emit_contract_fixture.py'],
    {
      cwd: resolve(repositoryRoot, 'services/pose-worker'),
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: '.' },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const artifact: unknown = JSON.parse(result.stdout);
  assert.equal(Value.Check(MotionArtifactSchema, artifact), true);
});
