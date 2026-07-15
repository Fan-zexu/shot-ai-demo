import type { JobStatus, ShootingHand } from '@shot-ai/contracts';

export interface PublicApiError {
  code: string;
  category: 'validation' | 'rejection' | 'system';
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface TemplateJob {
  id: string;
  type: 'template';
  entityId: string;
  status: JobStatus;
  stage: string | null;
  completedStages: string[];
  attempt: number;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateSummary {
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
  job: TemplateJob | null;
}

export interface TemplateDetails extends TemplateSummary {
  source: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    videoUrl: string;
  } | null;
  quality: {
    status: 'accepted' | 'rejected';
    checks: Array<{
      code: string;
      status: 'pass' | 'fail' | 'warning' | 'not_applicable';
      measuredValue?: number | string | boolean;
      message: string;
    }>;
  } | null;
}

export interface CreateTemplateResponse {
  templateId: string;
  jobId: string;
  status: 'queued';
}

export interface CreateComparisonResponse {
  comparisonId: string;
  jobId: string;
  status: 'queued';
}
