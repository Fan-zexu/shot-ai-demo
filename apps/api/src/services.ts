import type { AppDatabase } from './db/database.ts';
import { FileStore } from './files/file-store.ts';
import { ComparisonRepository } from './repositories/comparisons.ts';
import { ComparisonResultRepository } from './repositories/comparison-results.ts';
import { FileRepository } from './repositories/files.ts';
import { JobRepository } from './repositories/jobs.ts';
import { MotionArtifactRepository } from './repositories/motion-artifacts.ts';
import { QualityReportRepository } from './repositories/quality-reports.ts';
import { TemplateRepository } from './repositories/templates.ts';
import type { WorkerClient } from './worker-client/client.ts';

export interface AppServices {
  database: AppDatabase;
  fileStore: FileStore;
  files: FileRepository;
  templates: TemplateRepository;
  comparisons: ComparisonRepository;
  jobs: JobRepository;
  artifacts: MotionArtifactRepository;
  results: ComparisonResultRepository;
  qualityReports: QualityReportRepository;
  worker: WorkerClient;
  maxUploadBytes: number;
}

export function createServices(input: {
  database: AppDatabase;
  dataRoot: string;
  worker: WorkerClient;
  maxUploadBytes: number;
}): AppServices {
  return {
    database: input.database,
    fileStore: new FileStore(input.dataRoot),
    files: new FileRepository(input.database),
    templates: new TemplateRepository(input.database),
    comparisons: new ComparisonRepository(input.database),
    jobs: new JobRepository(input.database),
    artifacts: new MotionArtifactRepository(input.database),
    results: new ComparisonResultRepository(input.database),
    qualityReports: new QualityReportRepository(input.database),
    worker: input.worker,
    maxUploadBytes: input.maxUploadBytes,
  };
}
