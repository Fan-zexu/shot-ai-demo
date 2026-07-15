import type { ComparisonResult } from '@shot-ai/contracts';

import type { AppDatabase } from '../db/database.ts';

interface ComparisonResultRow {
  id: string;
  comparison_id: string;
  schema_version: string;
  result_file_id: string;
  result_sha256: string;
  template_preview_file_id: string;
  user_preview_file_id: string;
  algorithm_version: string;
  threshold_snapshot_json: string;
  created_at: string;
}

export interface ComparisonResultRecord {
  id: string;
  comparisonId: string;
  schemaVersion: string;
  resultFileId: string;
  resultSha256: string;
  templatePreviewFileId: string;
  userPreviewFileId: string;
  algorithmVersion: string;
  thresholdSnapshot: Record<string, number | string | boolean>;
  createdAt: string;
}

export class ComparisonResultRepository {
  constructor(private readonly database: AppDatabase) {}

  create(input: {
    result: ComparisonResult;
    resultFileId: string;
    resultSha256: string;
  }): ComparisonResultRecord {
    const result = input.result;
    this.database
      .prepare(
        `INSERT INTO comparison_results
          (id, comparison_id, schema_version, result_file_id, result_sha256,
           template_preview_file_id, user_preview_file_id, algorithm_version,
           threshold_snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        result.resultId,
        result.comparisonId,
        result.schemaVersion,
        input.resultFileId,
        input.resultSha256,
        result.previews.templateVideoFileId,
        result.previews.userVideoFileId,
        result.provenance.comparisonAlgorithmVersion,
        JSON.stringify(result.provenance.thresholdSnapshot),
        result.createdAt,
      );
    return this.get(result.resultId)!;
  }

  get(id: string): ComparisonResultRecord | null {
    const row = this.database
      .prepare('SELECT * FROM comparison_results WHERE id = ?')
      .get(id) as ComparisonResultRow | undefined;
    return row ? mapResult(row) : null;
  }
}

function mapResult(row: ComparisonResultRow): ComparisonResultRecord {
  return {
    id: row.id,
    comparisonId: row.comparison_id,
    schemaVersion: row.schema_version,
    resultFileId: row.result_file_id,
    resultSha256: row.result_sha256,
    templatePreviewFileId: row.template_preview_file_id,
    userPreviewFileId: row.user_preview_file_id,
    algorithmVersion: row.algorithm_version,
    thresholdSnapshot: JSON.parse(row.threshold_snapshot_json) as Record<
      string,
      number | string | boolean
    >,
    createdAt: row.created_at,
  };
}
