import { randomUUID } from 'node:crypto';

import type { AppDatabase } from '../db/database.ts';
import type { StoredFileKind } from '../files/file-store.ts';

interface FileRow {
  id: string;
  sha256: string;
  kind: StoredFileKind;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
  relative_path: string;
  created_at: string;
  deleted_at: string | null;
}

export interface FileRecord {
  id: string;
  sha256: string;
  kind: StoredFileKind;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
  createdAt: string;
  deletedAt: string | null;
}

export class FileRepository {
  constructor(private readonly database: AppDatabase) {}

  create(input: {
    sha256: string;
    kind: StoredFileKind;
    originalName?: string | null;
    mimeType: string;
    sizeBytes: number;
    relativePath: string;
  }): FileRecord {
    const id = `file_${randomUUID().replaceAll('-', '')}`;
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO files
          (id, sha256, kind, original_name, mime_type, size_bytes, relative_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.sha256,
        input.kind,
        input.originalName ?? null,
        input.mimeType,
        input.sizeBytes,
        input.relativePath,
        createdAt,
      );
    return this.get(id)!;
  }

  get(id: string): FileRecord | null {
    const row = this.database.prepare('SELECT * FROM files WHERE id = ?').get(id) as
      | FileRow
      | undefined;
    return row ? mapFile(row) : null;
  }

  getActive(id: string): FileRecord | null {
    const file = this.get(id);
    return file?.deletedAt === null ? file : null;
  }

  findActiveBySha256(sha256: string): FileRecord[] {
    return (
      this.database
        .prepare('SELECT * FROM files WHERE sha256 = ? AND deleted_at IS NULL ORDER BY created_at')
        .all(sha256) as FileRow[]
    ).map(mapFile);
  }

  isReferencedVideo(id: string): boolean {
    const row = this.database
      .prepare(
        `SELECT (
          EXISTS(SELECT 1 FROM templates WHERE source_file_id = ? AND deleted_at IS NULL)
          OR EXISTS(
            SELECT 1 FROM comparisons
            WHERE user_source_file_id = ? AND deleted_at IS NULL
          )
          OR EXISTS(
            SELECT 1 FROM comparison_results AS result
            JOIN comparisons AS comparison ON comparison.id = result.comparison_id
            WHERE comparison.deleted_at IS NULL
              AND (result.template_preview_file_id = ? OR result.user_preview_file_id = ?)
          )
        ) AS referenced`,
      )
      .get(id, id, id, id) as { referenced: number };
    return row.referenced === 1;
  }

  removeIfUnreferenced(id: string): FileRecord | null {
    const file = this.get(id);
    if (!file) return null;
    const row = this.database
      .prepare(
        `SELECT (
          EXISTS(SELECT 1 FROM templates WHERE source_file_id = ?)
          OR EXISTS(SELECT 1 FROM comparisons WHERE user_source_file_id = ?)
          OR EXISTS(
            SELECT 1 FROM motion_artifacts
            WHERE source_file_id = ? OR artifact_file_id = ?
          )
          OR EXISTS(
            SELECT 1 FROM comparison_results
            WHERE result_file_id = ? OR template_preview_file_id = ? OR user_preview_file_id = ?
          )
          OR EXISTS(SELECT 1 FROM quality_reports WHERE source_file_id = ?)
        ) AS referenced`,
      )
      .get(id, id, id, id, id, id, id, id) as { referenced: number };
    if (row.referenced === 1) return null;
    this.database.prepare('DELETE FROM files WHERE id = ?').run(id);
    return file;
  }
}

function mapFile(row: FileRow): FileRecord {
  return {
    id: row.id,
    sha256: row.sha256,
    kind: row.kind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    relativePath: row.relative_path,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}
