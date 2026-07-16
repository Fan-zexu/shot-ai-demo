import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  BodyRegions,
  type BodyRegion,
  type MotionArtifact,
  type QualityReport,
} from '@shot-ai/contracts';
import { acceptedMotionArtifact } from '@shot-ai/contracts/fixtures';

import { AppError } from '../src/errors.ts';
import type {
  AnalyzeMotionRequest,
  AnalyzeMotionResponse,
  RenderAlignedPreviewsRequest,
  RenderAlignedPreviewsResponse,
  WorkerClient,
  WorkerHealth,
} from '../src/worker-client/client.ts';

const allRegions = BodyRegions as readonly BodyRegion[];

export class FakeWorkerClient implements WorkerClient {
  rejectUsers = false;
  failUserAttempts = 0;
  failPreviewAttempts = 0;
  userAnalyzeCalls = 0;
  analyzeRequests: AnalyzeMotionRequest[] = [];

  async health(): Promise<WorkerHealth> {
    return {
      status: 'ready',
      modelLoaded: true,
      modelSha256: 'f'.repeat(64),
      busy: false,
    };
  }

  async analyzeMotion(request: AnalyzeMotionRequest): Promise<AnalyzeMotionResponse> {
    this.analyzeRequests.push(request);
    if (request.sourceType === 'user') this.userAnalyzeCalls += 1;
    if (request.sourceType === 'user' && this.failUserAttempts > 0) {
      this.failUserAttempts -= 1;
      throw new AppError({
        code: 'WORKER_UNAVAILABLE',
        category: 'system',
        message: 'fixture Worker outage',
        retryable: true,
      });
    }
    if (request.sourceType === 'user' && this.rejectUsers) {
      const report = qualityReport(request, 'rejected');
      report.comparableRegions = ['shooting_arm'];
      report.rejectedRegions = { lower_body: 'feet_missing' };
      report.rejectionCodes = ['USER_BODY_OUT_OF_FRAME'];
      return {
        status: 'rejected',
        qualityReport: report,
        rejectionCodes: ['USER_BODY_OUT_OF_FRAME'],
      };
    }
    const artifact = structuredClone(acceptedMotionArtifact) as MotionArtifact;
    artifact.artifactId = `artifact_${request.requestId}_${request.sourceType}`;
    artifact.sourceType = request.sourceType;
    artifact.sourceFileId = request.sourceFileId;
    artifact.sourceSha256 = request.sourceSha256;
    artifact.createdAt = new Date().toISOString();
    artifact.capture.shootingHand = request.shootingHand;
    artifact.capture.normalSpeedConfirmed = request.normalSpeedConfirmed;
    artifact.quality.comparableRegions = [...allRegions];
    artifact.quality.rejectedRegions = {};
    await mkdir(dirname(request.outputPath), { recursive: true });
    await writeFile(request.outputPath, gzipSync(JSON.stringify(artifact)));
    return {
      status: 'accepted',
      qualityReport: qualityReport(request, 'accepted'),
      motionArtifactPath: request.outputPath,
    };
  }

  async renderAlignedPreviews(
    request: RenderAlignedPreviewsRequest,
  ): Promise<RenderAlignedPreviewsResponse> {
    if (this.failPreviewAttempts > 0) {
      this.failPreviewAttempts -= 1;
      throw new AppError({
        code: 'PREVIEW_GENERATION_FAILED',
        category: 'system',
        message: 'fixture preview failure',
        retryable: true,
      });
    }
    const templateBytes = Buffer.concat([
      Buffer.from('fixture-template-preview:'),
      Buffer.from(String(request.timeline.length)),
    ]);
    const userBytes = Buffer.concat([
      Buffer.from('fixture-user-preview:'),
      Buffer.from(String(request.timeline.length)),
    ]);
    await Promise.all([
      mkdir(dirname(request.templateOutputPath), { recursive: true }),
      mkdir(dirname(request.userOutputPath), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(request.templateOutputPath, templateBytes),
      writeFile(request.userOutputPath, userBytes),
    ]);
    return {
      frameCount: request.timeline.length,
      durationMs: (request.timeline.length * 1000) / 30,
      fps: 30,
      templateSha256: sha256(templateBytes),
      userSha256: sha256(userBytes),
    };
  }
}

function qualityReport(
  request: AnalyzeMotionRequest,
  status: QualityReport['status'],
): QualityReport {
  return {
    schemaVersion: '1.0',
    sourceFileId: request.sourceFileId,
    sourceType: request.sourceType,
    status,
    checks: [],
    overallPoseConfidence: 0.9,
    comparableRegions: [...allRegions],
    rejectedRegions: {},
    rejectionCodes: [],
    createdAt: new Date().toISOString(),
  };
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
