import type { JobStatus } from '@shot-ai/contracts';

import { AppError } from '../errors.ts';

const transitions: Record<JobStatus, ReadonlySet<JobStatus>> = {
  queued: new Set(['running', 'failed']),
  running: new Set(['running', 'queued', 'ready', 'rejected', 'failed']),
  ready: new Set(),
  rejected: new Set(),
  failed: new Set(['queued']),
};

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (transitions[from]?.has(to) !== true) {
    throw new AppError({
      code: 'INVALID_JOB_TRANSITION',
      category: 'validation',
      message: `INVALID_JOB_TRANSITION: ${from} -> ${to}`,
      retryable: false,
      details: { from, to },
    });
  }
}
