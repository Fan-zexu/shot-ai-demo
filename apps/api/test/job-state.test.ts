import assert from 'node:assert/strict';
import test from 'node:test';

import { JobRepository } from '../src/repositories/jobs.ts';
import { recoverInterruptedJobs } from '../src/jobs/recovery.ts';
import { createTestContext } from './helpers.ts';

test('job transitions append events in the same transaction', (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());
  const jobs = new JobRepository(testContext.database);
  const job = jobs.create({ type: 'template', entityId: 'tpl_1' });

  jobs.transition(job.id, { status: 'running', stage: 'validating_file' });
  jobs.transition(job.id, { status: 'running', stage: 'extracting_pose' });

  assert.deepEqual(jobs.get(job.id)?.completedStages, ['validating_file']);
  assert.deepEqual(
    jobs.events(job.id).map((event) => [event.status, event.stage]),
    [
      ['queued', null],
      ['running', 'validating_file'],
      ['running', 'extracting_pose'],
    ],
  );
});

test('rejected jobs cannot retry while failed jobs can', (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());
  const jobs = new JobRepository(testContext.database);
  const rejected = jobs.create({ type: 'comparison', entityId: 'cmp_rejected' });
  jobs.transition(rejected.id, { status: 'running', stage: 'validating_user' });
  jobs.transition(rejected.id, { status: 'rejected', stage: 'validating_user' });
  assert.throws(() => jobs.retry(rejected.id), /JOB_NOT_RETRYABLE/);

  const failed = jobs.create({ type: 'comparison', entityId: 'cmp_failed' });
  jobs.transition(failed.id, { status: 'running', stage: 'extracting_user_pose' });
  jobs.transition(failed.id, {
    status: 'failed',
    stage: 'extracting_user_pose',
    error: { code: 'WORKER_UNAVAILABLE' },
  });
  const retried = jobs.retry(failed.id);
  assert.equal(retried.status, 'queued');
  assert.equal(retried.attempt, 2);
  assert.equal(retried.error, null);
});

test('restart recovery requeues once and fails a repeatedly interrupted job', (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());
  const jobs = new JobRepository(testContext.database);

  const first = jobs.create({ type: 'template', entityId: 'tpl_first' });
  jobs.transition(first.id, { status: 'running', stage: 'extracting_pose' });
  assert.deepEqual(recoverInterruptedJobs(jobs), { requeued: 1, failed: 0 });
  assert.equal(jobs.get(first.id)?.attempt, 2);

  jobs.transition(first.id, { status: 'running', stage: 'extracting_pose' });
  assert.deepEqual(recoverInterruptedJobs(jobs), { requeued: 0, failed: 1 });
  assert.equal(jobs.get(first.id)?.status, 'failed');
});

