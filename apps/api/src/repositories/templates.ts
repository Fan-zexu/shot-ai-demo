import { randomUUID } from 'node:crypto';

import type { JobStatus, ShootingHand } from '@shot-ai/contracts';

import type { AppDatabase } from '../db/database.ts';

interface TemplateRow {
  id: string;
  name: string;
  source_file_id: string;
  current_artifact_id: string | null;
  shooting_hand: ShootingHand;
  status: JobStatus;
  rejection_code: string | null;
  error_json: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TemplateRecord {
  id: string;
  name: string;
  sourceFileId: string;
  currentArtifactId: string | null;
  shootingHand: ShootingHand;
  status: JobStatus;
  rejectionCode: string | null;
  error: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export class TemplateRepository {
  constructor(private readonly database: AppDatabase) {}

  create(input: {
    name: string;
    sourceFileId: string;
    shootingHand: ShootingHand;
  }): TemplateRecord {
    const id = `tpl_${randomUUID().replaceAll('-', '')}`;
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO templates
          (id, name, source_file_id, shooting_hand, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 1, ?, ?)`,
      )
      .run(id, input.name, input.sourceFileId, input.shootingHand, now, now);
    return this.get(id)!;
  }

  get(id: string): TemplateRecord | null {
    const row = this.database.prepare('SELECT * FROM templates WHERE id = ?').get(id) as
      | TemplateRow
      | undefined;
    return row ? mapTemplate(row) : null;
  }

  listSelectable(): TemplateRecord[] {
    return (
      this.database
        .prepare("SELECT * FROM templates WHERE status = 'ready' AND deleted_at IS NULL ORDER BY created_at DESC")
        .all() as TemplateRow[]
    ).map(mapTemplate);
  }

  remove(id: string): { mode: 'physical' | 'soft' } {
    const references = this.database
      .prepare('SELECT COUNT(*) AS count FROM comparisons WHERE template_id = ?')
      .get(id) as { count: number };
    if (references.count > 0) {
      this.database
        .prepare('UPDATE templates SET deleted_at = ?, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), new Date().toISOString(), id);
      return { mode: 'soft' };
    }
    this.database.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return { mode: 'physical' };
  }
}

function mapTemplate(row: TemplateRow): TemplateRecord {
  return {
    id: row.id,
    name: row.name,
    sourceFileId: row.source_file_id,
    currentArtifactId: row.current_artifact_id,
    shootingHand: row.shooting_hand,
    status: row.status,
    rejectionCode: row.rejection_code,
    error: row.error_json ? (JSON.parse(row.error_json) as Record<string, unknown>) : null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

