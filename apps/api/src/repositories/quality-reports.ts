import type { QualityReport } from '@shot-ai/contracts';

import type { AppDatabase } from '../db/database.ts';

interface QualityReportRow {
  job_id: string;
  source_file_id: string;
  report_json: string;
  created_at: string;
}

export interface QualityReportRecord {
  jobId: string;
  sourceFileId: string;
  report: QualityReport;
  createdAt: string;
}

export class QualityReportRepository {
  constructor(private readonly database: AppDatabase) {}

  save(jobId: string, sourceFileId: string, report: QualityReport): QualityReportRecord {
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO quality_reports (job_id, source_file_id, report_json, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           source_file_id = excluded.source_file_id,
           report_json = excluded.report_json,
           created_at = excluded.created_at`,
      )
      .run(jobId, sourceFileId, JSON.stringify(report), createdAt);
    return this.get(jobId)!;
  }

  get(jobId: string): QualityReportRecord | null {
    const row = this.database
      .prepare('SELECT * FROM quality_reports WHERE job_id = ?')
      .get(jobId) as QualityReportRow | undefined;
    return row
      ? {
          jobId: row.job_id,
          sourceFileId: row.source_file_id,
          report: JSON.parse(row.report_json) as QualityReport,
          createdAt: row.created_at,
        }
      : null;
  }
}
