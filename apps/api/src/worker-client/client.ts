import type {
  QualityReport,
  ShootingHand,
  SourceType,
} from '@shot-ai/contracts';

export interface AnalyzeMotionRequest {
  requestId: string;
  sourceType: SourceType;
  filePath: string;
  sourceFileId: string;
  sourceSha256: string;
  shootingHand: ShootingHand;
  normalSpeedConfirmed: true;
  thresholds: Record<string, number | string | boolean>;
  outputPath: string;
}

export type AnalyzeMotionResponse =
  | {
      status: 'accepted';
      qualityReport: QualityReport;
      motionArtifactPath: string;
    }
  | {
      status: 'rejected';
      qualityReport: QualityReport;
      rejectionCodes: string[];
    };

export interface RenderAlignedPreviewsRequest {
  templatePath: string;
  userPath: string;
  timeline: Array<{ templateFrameIndex: number; userFrameIndex: number }>;
  templateOutputPath: string;
  userOutputPath: string;
}

export interface RenderAlignedPreviewsResponse {
  frameCount: number;
  durationMs: number;
  fps: 30;
  templateSha256: string;
  userSha256: string;
}

export interface WorkerHealth {
  status: 'ready';
  modelLoaded: boolean;
  modelSha256: string | null;
  busy: boolean;
}

export interface WorkerClient {
  health(): Promise<WorkerHealth>;
  analyzeMotion(request: AnalyzeMotionRequest): Promise<AnalyzeMotionResponse>;
  renderAlignedPreviews(
    request: RenderAlignedPreviewsRequest,
  ): Promise<RenderAlignedPreviewsResponse>;
}
