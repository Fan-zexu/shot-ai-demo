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

  findActiveBySha256(sha256: string): FileRecord[] {
    return (
      this.database
        .prepare('SELECT * FROM files WHERE sha256 = ? AND deleted_at IS NULL ORDER BY created_at')
        .all(sha256) as FileRow[]
    ).map(mapFile);
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

