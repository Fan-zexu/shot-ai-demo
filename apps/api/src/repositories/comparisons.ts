import { randomUUID } from 'node:crypto';

import type { JobStatus, ShootingHand } from '@shot-ai/contracts';

import type { AppDatabase } from '../db/database.ts';

interface ComparisonRow {
  id: string;
  user_source_file_id: string;
  user_artifact_id: string | null;
  template_id: string;
  template_artifact_id: string | null;
  result_id: string | null;
  shooting_hand: ShootingHand;
  status: JobStatus;
  rejection_code: string | null;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ComparisonRecord {
  id: string;
  userSourceFileId: string;
  userArtifactId: string | null;
  templateId: string;
  templateArtifactId: string | null;
  resultId: string | null;
  shootingHand: ShootingHand;
  status: JobStatus;
  rejectionCode: string | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export class ComparisonRepository {
  constructor(private readonly database: AppDatabase) {}

  create(input: {
    userSourceFileId: string;
    templateId: string;
    shootingHand: ShootingHand;
    templateArtifactId?: string | null;
  }): ComparisonRecord {
    const id = `cmp_${randomUUID().replaceAll('-', '')}`;
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO comparisons
          (id, user_source_file_id, template_id, template_artifact_id, shooting_hand, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
      )
      .run(
        id,
        input.userSourceFileId,
        input.templateId,
        input.templateArtifactId ?? null,
        input.shootingHand,
        now,
        now,
      );
    return this.get(id)!;
  }

  get(id: string): ComparisonRecord | null {
    const row = this.database.prepare('SELECT * FROM comparisons WHERE id = ?').get(id) as
      | ComparisonRow
      | undefined;
    return row ? mapComparison(row) : null;
  }

  getActive(id: string): ComparisonRecord | null {
    const comparison = this.get(id);
    return comparison?.deletedAt === null ? comparison : null;
  }

  markRunning(id: string): ComparisonRecord {
    return this.updateStatus(id, { status: 'running' });
  }

  attachUserArtifact(id: string, artifactId: string): ComparisonRecord {
    return this.updateStatus(id, { status: 'running', userArtifactId: artifactId });
  }

  markReady(id: string, resultId: string): ComparisonRecord {
    return this.updateStatus(id, { status: 'ready', resultId });
  }

  markRejected(id: string, code: string, error: Record<string, unknown>): ComparisonRecord {
    return this.updateStatus(id, { status: 'rejected', rejectionCode: code, error });
  }

  markFailed(id: string, error: Record<string, unknown>): ComparisonRecord {
    return this.updateStatus(id, { status: 'failed', error });
  }

  remove(id: string): void {
    const now = new Date().toISOString();
    const result = this.database
      .prepare('UPDATE comparisons SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
    if (result.changes !== 1) throw new Error(`COMPARISON_NOT_FOUND: ${id}`);
  }

  private updateStatus(
    id: string,
    input: {
      status: JobStatus;
      userArtifactId?: string;
      resultId?: string;
      rejectionCode?: string;
      error?: Record<string, unknown>;
    },
  ): ComparisonRecord {
    const updatedAt = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE comparisons
         SET status = ?, user_artifact_id = COALESCE(?, user_artifact_id),
             result_id = COALESCE(?, result_id), rejection_code = ?, error_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status,
        input.userArtifactId ?? null,
        input.resultId ?? null,
        input.rejectionCode ?? null,
        input.error ? JSON.stringify(input.error) : null,
        updatedAt,
        id,
      );
    if (result.changes !== 1) throw new Error(`COMPARISON_NOT_FOUND: ${id}`);
    return this.get(id)!;
  }
}

function mapComparison(row: ComparisonRow): ComparisonRecord {
  return {
    id: row.id,
    userSourceFileId: row.user_source_file_id,
    userArtifactId: row.user_artifact_id,
    templateId: row.template_id,
    templateArtifactId: row.template_artifact_id,
    resultId: row.result_id,
    shootingHand: row.shooting_hand,
    status: row.status,
    rejectionCode: row.rejection_code,
    error: row.error_json ? (JSON.parse(row.error_json) as Record<string, unknown>) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
