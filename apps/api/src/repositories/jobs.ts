import { randomUUID } from 'node:crypto';

import type { JobStatus } from '@shot-ai/contracts';

import type { AppDatabase } from '../db/database.ts';
import { AppError } from '../errors.ts';
import { assertJobTransition } from '../jobs/state-machine.ts';

export type JobType = 'template' | 'comparison';

interface JobRow {
  id: string;
  type: JobType;
  entity_id: string;
  status: JobStatus;
  stage: string | null;
  completed_stages_json: string;
  attempt: number;
  error_json: string | null;
  created_at: string;
  updated_at: string;
}

interface JobEventRow {
  id: number;
  job_id: string;
  status: JobStatus;
  stage: string | null;
  attempt: number;
  error_json: string | null;
  created_at: string;
}

export interface JobRecord {
  id: string;
  type: JobType;
  entityId: string;
  status: JobStatus;
  stage: string | null;
  completedStages: string[];
  attempt: number;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobEventRecord {
  id: number;
  jobId: string;
  status: JobStatus;
  stage: string | null;
  attempt: number;
  error: Record<string, unknown> | null;
  createdAt: string;
}

export class JobRepository {
  constructor(private readonly database: AppDatabase) {}

  create(input: { type: JobType; entityId: string }): JobRecord {
    const id = `job_${randomUUID().replaceAll('-', '')}`;
    const now = new Date().toISOString();
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO jobs
            (id, type, entity_id, status, stage, completed_stages_json, attempt, created_at, updated_at)
           VALUES (?, ?, ?, 'queued', NULL, '[]', 1, ?, ?)`,
        )
        .run(id, input.type, input.entityId, now, now);
      this.insertEvent(id, 'queued', null, 1, null, now);
    });
    transaction();
    return this.get(id)!;
  }

  get(id: string): JobRecord | null {
    const row = this.database.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
      | JobRow
      | undefined;
    return row ? mapJob(row) : null;
  }

  listByStatus(status: JobStatus): JobRecord[] {
    return (
      this.database.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY created_at').all(status) as JobRow[]
    ).map(mapJob);
  }

  events(id: string): JobEventRecord[] {
    return (
      this.database.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY id').all(id) as JobEventRow[]
    ).map(mapEvent);
  }

  transition(
    id: string,
    input: {
      status: JobStatus;
      stage: string | null;
      error?: Record<string, unknown> | null;
    },
  ): JobRecord {
    const current = this.require(id);
    assertJobTransition(current.status, input.status);
    const completedStages = [...current.completedStages];
    if (
      current.status === 'running' &&
      current.stage &&
      current.stage !== input.stage &&
      !completedStages.includes(current.stage)
    ) {
      completedStages.push(current.stage);
    }
    const error = input.error ?? null;
    const now = new Date().toISOString();
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE jobs
           SET status = ?, stage = ?, completed_stages_json = ?, error_json = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.status,
          input.stage,
          JSON.stringify(completedStages),
          error ? JSON.stringify(error) : null,
          now,
          id,
        );
      this.insertEvent(id, input.status, input.stage, current.attempt, error, now);
    });
    transaction();
    return this.require(id);
  }

  retry(id: string): JobRecord {
    const current = this.require(id);
    if (current.status !== 'failed') {
      throw new AppError({
        code: 'JOB_NOT_RETRYABLE',
        category: 'validation',
        message: `JOB_NOT_RETRYABLE: ${current.status}`,
        retryable: false,
      });
    }
    return this.requeue(id, current.attempt + 1);
  }

  requeueInterrupted(id: string): JobRecord {
    const current = this.require(id);
    if (current.status !== 'running') {
      throw new AppError({
        code: 'INVALID_JOB_TRANSITION',
        category: 'validation',
        message: `INVALID_JOB_TRANSITION: ${current.status} -> queued`,
        retryable: false,
      });
    }
    return this.requeue(id, current.attempt + 1);
  }

  failInterrupted(id: string): JobRecord {
    return this.transition(id, {
      status: 'failed',
      stage: this.require(id).stage,
      error: { code: 'PROCESS_INTERRUPTED_REPEATEDLY' },
    });
  }

  private requeue(id: string, attempt: number): JobRecord {
    const current = this.require(id);
    assertJobTransition(current.status, 'queued');
    const now = new Date().toISOString();
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE jobs
           SET status = 'queued', stage = NULL, attempt = ?, error_json = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(attempt, now, id);
      this.insertEvent(id, 'queued', null, attempt, null, now);
    });
    transaction();
    return this.require(id);
  }

  private require(id: string): JobRecord {
    const job = this.get(id);
    if (!job) throw new Error(`JOB_NOT_FOUND: ${id}`);
    return job;
  }

  private insertEvent(
    jobId: string,
    status: JobStatus,
    stage: string | null,
    attempt: number,
    error: Record<string, unknown> | null,
    createdAt: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO job_events (job_id, status, stage, attempt, error_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(jobId, status, stage, attempt, error ? JSON.stringify(error) : null, createdAt);
  }
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    type: row.type,
    entityId: row.entity_id,
    status: row.status,
    stage: row.stage,
    completedStages: JSON.parse(row.completed_stages_json) as string[],
    attempt: row.attempt,
    error: row.error_json ? (JSON.parse(row.error_json) as Record<string, unknown>) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: JobEventRow): JobEventRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    stage: row.stage,
    attempt: row.attempt,
    error: row.error_json ? (JSON.parse(row.error_json) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  };
}

