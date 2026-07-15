import type { JobRepository } from '../repositories/jobs.ts';

export function recoverInterruptedJobs(jobs: JobRepository): {
  requeued: number;
  failed: number;
} {
  let requeued = 0;
  let failed = 0;

  for (const job of jobs.listByStatus('running')) {
    if (job.attempt >= 2) {
      jobs.failInterrupted(job.id);
      failed += 1;
    } else {
      jobs.requeueInterrupted(job.id);
      requeued += 1;
    }
  }

  return { requeued, failed };
}

