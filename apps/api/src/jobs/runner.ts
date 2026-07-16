import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';

import {
  ComparisonResultSchema,
  MotionArtifactSchema,
  MotionEventNames,
  QualityReportSchema,
  type ComparisonResult,
  type MotionArtifact,
  type QualityReport,
  type ShootingHand,
  type SourceType,
} from '@shot-ai/contracts';
import {
  checkCompatibility,
  compareMotions,
  ComparisonRejected,
} from '@shot-ai/comparison-engine';

import { assertSchema, readGzipArtifact } from '../artifacts/io.ts';
import { AppError } from '../errors.ts';
import type { FileStore, StoredFileKind } from '../files/file-store.ts';
import type { ComparisonRepository } from '../repositories/comparisons.ts';
import type { ComparisonResultRepository } from '../repositories/comparison-results.ts';
import type { FileRecord, FileRepository } from '../repositories/files.ts';
import type { JobRecord, JobRepository } from '../repositories/jobs.ts';
import type { MotionArtifactRepository } from '../repositories/motion-artifacts.ts';
import type { QualityReportRepository } from '../repositories/quality-reports.ts';
import type { TemplateRepository } from '../repositories/templates.ts';
import type { WorkerClient } from '../worker-client/client.ts';

interface JobRunnerDependencies {
  fileStore: FileStore;
  files: FileRepository;
  templates: TemplateRepository;
  comparisons: ComparisonRepository;
  jobs: JobRepository;
  artifacts: MotionArtifactRepository;
  results: ComparisonResultRepository;
  qualityReports: QualityReportRepository;
  worker: WorkerClient;
  maxStoredBytes: number;
}

interface AcceptedAnalysis {
  status: 'accepted';
  artifact: MotionArtifact;
  artifactPath: string;
}

interface RejectedAnalysis {
  status: 'rejected';
  report: QualityReport;
  rejectionCodes: string[];
}

export class JobRunner {
  private tail: Promise<void> = Promise.resolve();
  private readonly scheduled = new Set<string>();

  constructor(private readonly dependencies: JobRunnerDependencies) {}

  enqueue(jobId: string): void {
    if (this.scheduled.has(jobId)) return;
    this.scheduled.add(jobId);
    this.tail = this.tail
      .then(() => this.process(jobId))
      .catch(() => undefined)
      .finally(() => this.scheduled.delete(jobId));
  }

  async drain(): Promise<void> {
    await this.tail;
  }

  private async process(jobId: string): Promise<void> {
    const job = this.dependencies.jobs.get(jobId);
    if (!job || job.status !== 'queued') return;
    try {
      if (job.type === 'template') await this.runTemplate(job);
      else await this.runComparison(job);
    } catch (error) {
      this.finishWithError(job, error);
    }
  }

  private async runTemplate(job: JobRecord) {
    const template = this.dependencies.templates.get(job.entityId);
    if (!template) throw new Error(`TEMPLATE_NOT_FOUND: ${job.entityId}`);
    this.dependencies.templates.markRunning(template.id);
    this.stage(job.id, 'validating_file');
    const source = await this.requireFile(template.sourceFileId);
    this.stage(job.id, 'extracting_pose');
    const analysis = await this.analyze(
      job,
      'template',
      source,
      template.shootingHand,
    );
    if (analysis.status === 'rejected') {
      throw this.rejection(analysis.rejectionCodes, analysis.report);
    }
    try {
      this.stage(job.id, 'validating_pose_quality');
      this.assertAcceptedArtifact(analysis.artifact, source, 'template', template.shootingHand);
      this.stage(job.id, 'detecting_events');
      this.assertOrderedEvents(analysis.artifact);
      this.stage(job.id, 'normalizing_motion');
      if (analysis.artifact.frames.some((frame) => frame.normalizedLandmarks.length === 0)) {
        throw new AppError({
          code: 'ARTIFACT_SCHEMA_INVALID',
          category: 'system',
          message: 'Accepted artifact contains frames without normalized landmarks',
          retryable: false,
        });
      }
      this.stage(job.id, 'writing_artifact');
      const artifactRecord = await this.storeArtifact(analysis.artifact, analysis.artifactPath);
      this.dependencies.templates.markReady(template.id, artifactRecord.id);
      this.dependencies.jobs.transition(job.id, { status: 'ready', stage: null });
    } catch (error) {
      await this.removeWorkerArtifact(analysis.artifactPath);
      throw error;
    }
  }

  private async runComparison(job: JobRecord) {
    const comparison = this.dependencies.comparisons.get(job.entityId);
    if (!comparison) throw new Error(`COMPARISON_NOT_FOUND: ${job.entityId}`);
    const template = this.dependencies.templates.get(comparison.templateId);
    if (!template || !comparison.templateArtifactId) {
      throw new AppError({
        code: 'TEMPLATE_NOT_READY',
        category: 'rejection',
        message: 'Selected template no longer has a ready artifact',
        retryable: false,
      });
    }
    this.dependencies.comparisons.markRunning(comparison.id);
    this.stage(job.id, 'validating_user');
    const userSource = await this.requireFile(comparison.userSourceFileId);
    const templateSource = await this.requireFile(template.sourceFileId);
    let userArtifact: MotionArtifact;
    let userArtifactPath: string | null = null;
    if (comparison.userArtifactId) {
      // Retry and restart recovery resume from the last artifact whose schema
      // and provenance were already verified and committed.
      userArtifact = await this.loadArtifact(comparison.userArtifactId);
    } else {
      this.stage(job.id, 'extracting_user_pose');
      const analysis = await this.analyze(
        job,
        'user',
        userSource,
        comparison.shootingHand,
      );
      if (analysis.status === 'rejected') {
        throw this.rejection(analysis.rejectionCodes, analysis.report);
      }
      userArtifact = analysis.artifact;
      userArtifactPath = analysis.artifactPath;
    }
    try {
      this.stage(job.id, 'detecting_user_events');
      this.assertAcceptedArtifact(userArtifact, userSource, 'user', comparison.shootingHand);
      this.assertOrderedEvents(userArtifact);
      if (userArtifactPath) {
        const userArtifactRecord = await this.storeArtifact(
          userArtifact,
          userArtifactPath,
        );
        this.dependencies.comparisons.attachUserArtifact(comparison.id, userArtifactRecord.id);
      }
    } catch (error) {
      if (userArtifactPath) await this.removeWorkerArtifact(userArtifactPath);
      throw error;
    }
    const templateArtifact = await this.loadArtifact(comparison.templateArtifactId);
    this.stage(job.id, 'checking_compatibility');
    checkCompatibility(templateArtifact, userArtifact);
    this.stage(job.id, 'aligning_phases');
    // The engine needs IDs to build its immutable result shape, but preview
    // files do not exist until the shared timeline has been rendered. This
    // draft is never persisted; renderAndStorePreviews replaces both IDs.
    let result = compareMotions({
      comparisonId: comparison.id,
      template: templateArtifact,
      user: userArtifact,
      templatePreviewFileId: 'unpersisted_template_preview',
      userPreviewFileId: 'unpersisted_user_preview',
    });
    this.stage(job.id, 'computing_differences');
    assertSchema(ComparisonResultSchema, result, 'ARTIFACT_SCHEMA_INVALID');
    this.stage(job.id, 'generating_previews');
    result = await this.renderAndStorePreviews(
      result,
      templateSource,
      userSource,
    );
    this.stage(job.id, 'building_report');
    assertSchema(ComparisonResultSchema, result, 'ARTIFACT_SCHEMA_INVALID');
    const storedResult = await this.storeBuffer(
      gzipSync(JSON.stringify(result)),
      'result',
      'application/gzip',
      `${result.resultId}.comparison.json.gz`,
    );
    this.dependencies.results.create({
      result,
      resultFileId: storedResult.id,
      resultSha256: storedResult.sha256,
    });
    this.dependencies.comparisons.markReady(comparison.id, result.resultId);
    this.dependencies.jobs.transition(job.id, { status: 'ready', stage: null });
  }

  private async analyze(
    job: JobRecord,
    sourceType: SourceType,
    source: FileRecord,
    shootingHand: ShootingHand,
  ): Promise<AcceptedAnalysis | RejectedAnalysis> {
    await mkdir(this.dependencies.fileStore.temporaryDirectory, { recursive: true });
    const outputPath = resolve(
      this.dependencies.fileStore.temporaryDirectory,
      `${job.id}.${randomUUID()}.motion.json.gz`,
    );
    try {
      const response = await this.dependencies.worker.analyzeMotion({
        requestId: job.id,
        sourceType,
        filePath: this.dependencies.fileStore.resolvePath(source.relativePath),
        sourceFileId: source.id,
        sourceSha256: source.sha256,
        shootingHand,
        // Demo uploads do not require a speed declaration. Mark both sources
        // as timing-untrusted so slow motion or speed ramps cannot be mistaken
        // for the shooter's real movement speed.
        normalSpeedConfirmed: false,
        thresholds: {},
        outputPath,
      });
      assertSchema(QualityReportSchema, response.qualityReport, 'ARTIFACT_SCHEMA_INVALID');
      this.dependencies.qualityReports.save(job.id, source.id, response.qualityReport);
      if (response.status === 'rejected') {
        if (response.qualityReport.status !== 'rejected') {
          throw new AppError({
            code: 'ARTIFACT_SCHEMA_INVALID',
            category: 'system',
            message: 'Worker rejection contains an accepted QualityReport',
            retryable: false,
          });
        }
        await rm(outputPath, { force: true });
        return {
          status: 'rejected',
          report: response.qualityReport,
          rejectionCodes: response.rejectionCodes,
        };
      }
      if (response.qualityReport.status !== 'accepted') {
        throw new AppError({
          code: 'ARTIFACT_SCHEMA_INVALID',
          category: 'system',
          message: 'Worker acceptance contains a rejected QualityReport',
          retryable: false,
        });
      }
      if (resolve(response.motionArtifactPath) !== outputPath) {
        throw new AppError({
          code: 'PATH_OUTSIDE_DATA_ROOT',
          category: 'system',
          message: 'Worker returned an unexpected artifact path',
          retryable: false,
        });
      }
      const artifact = await readGzipArtifact(outputPath, MotionArtifactSchema);
      return { status: 'accepted', artifact, artifactPath: outputPath };
    } catch (error) {
      await Promise.all([
        rm(outputPath, { force: true }),
        rm(`${outputPath}.partial`, { force: true }),
      ]);
      throw error;
    }
  }

  private assertAcceptedArtifact(
    artifact: MotionArtifact,
    source: FileRecord,
    sourceType: SourceType,
    shootingHand: ShootingHand,
  ) {
    if (
      artifact.sourceType !== sourceType ||
      artifact.sourceFileId !== source.id ||
      artifact.sourceSha256 !== source.sha256 ||
      artifact.capture.shootingHand !== shootingHand
    ) {
      throw new AppError({
        code: 'ARTIFACT_SCHEMA_INVALID',
        category: 'system',
        message: 'Worker artifact provenance does not match the request',
        retryable: false,
      });
    }
  }

  private assertOrderedEvents(artifact: MotionArtifact) {
    const frames = MotionEventNames.map((name) => artifact.events[name].frameIndex);
    if (frames.some((frame, index) => index > 0 && frame <= frames[index - 1]!)) {
      throw new AppError({
        code: 'ARTIFACT_SCHEMA_INVALID',
        category: 'system',
        message: 'Worker artifact contains unordered events',
        retryable: false,
      });
    }
  }

  private async storeArtifact(artifact: MotionArtifact, path: string) {
    try {
      const stored = await this.storePath(
        path,
        'artifact',
        'application/gzip',
        `${artifact.artifactId}.motion.json.gz`,
      );
      return this.dependencies.artifacts.create({
        artifact,
        artifactFileId: stored.id,
        artifactSha256: stored.sha256,
      });
    } finally {
      await rm(path, { force: true });
    }
  }

  private async removeWorkerArtifact(path: string) {
    await Promise.all([
      rm(path, { force: true }),
      rm(`${path}.partial`, { force: true }),
    ]);
  }

  private async loadArtifact(id: string): Promise<MotionArtifact> {
    const record = this.dependencies.artifacts.get(id);
    if (!record) throw new Error(`ARTIFACT_NOT_FOUND: ${id}`);
    const file = this.dependencies.files.getActive(record.artifactFileId);
    if (!file) throw new Error(`FILE_NOT_FOUND: ${record.artifactFileId}`);
    return readGzipArtifact(
      this.dependencies.fileStore.resolvePath(file.relativePath),
      MotionArtifactSchema,
    );
  }

  private async renderAndStorePreviews(
    result: ComparisonResult,
    templateSource: FileRecord,
    userSource: FileRecord,
  ): Promise<ComparisonResult> {
    await mkdir(this.dependencies.fileStore.temporaryDirectory, { recursive: true });
    const templateOutputPath = resolve(
      this.dependencies.fileStore.temporaryDirectory,
      `${result.resultId}.template.mp4`,
    );
    const userOutputPath = resolve(
      this.dependencies.fileStore.temporaryDirectory,
      `${result.resultId}.user.mp4`,
    );
    try {
      const displayTimeline = result.displayTimeline ?? result.renderTimeline.map((sample) => ({
        displayFrameIndex: sample.sampleIndex,
        displayTimestampMs: sample.sampleIndex * 1000 / 30,
        alignmentSampleIndex: sample.sampleIndex,
      }));
      const preview = await this.dependencies.worker.renderAlignedPreviews({
        templatePath: this.dependencies.fileStore.resolvePath(templateSource.relativePath),
        userPath: this.dependencies.fileStore.resolvePath(userSource.relativePath),
        timeline: displayTimeline.map((displaySample) => {
          const alignmentSample = result.renderTimeline[displaySample.alignmentSampleIndex]!;
          return {
            templateFrameIndex: alignmentSample.templateFrameIndex,
            userFrameIndex: alignmentSample.userFrameIndex,
          };
        }),
        templateOutputPath,
        userOutputPath,
      });
      if (
        preview.fps !== 30 ||
        preview.frameCount !== displayTimeline.length ||
        Math.abs(preview.durationMs - (preview.frameCount * 1000) / 30) > 0.001
      ) {
        throw new AppError({
          code: 'PREVIEW_GENERATION_FAILED',
          category: 'system',
          message: 'Worker preview cardinality does not match the display clock',
          retryable: true,
        });
      }
      const templatePreview = await this.storePath(
        templateOutputPath,
        'preview',
        'video/mp4',
        `${result.resultId}.template.mp4`,
      );
      const userPreview = await this.storePath(
        userOutputPath,
        'preview',
        'video/mp4',
        `${result.resultId}.user.mp4`,
      );
      if (
        templatePreview.sha256 !== preview.templateSha256 ||
        userPreview.sha256 !== preview.userSha256
      ) {
        throw new AppError({
          code: 'PREVIEW_GENERATION_FAILED',
          category: 'system',
          message: 'Stored preview hash does not match Worker output',
          retryable: true,
        });
      }
      return {
        ...result,
        previews: {
          fps: 30,
          frameCount: preview.frameCount,
          durationMs: preview.durationMs,
          templateVideoFileId: templatePreview.id,
          userVideoFileId: userPreview.id,
        },
      };
    } finally {
      await Promise.all([
        rm(templateOutputPath, { force: true }),
        rm(userOutputPath, { force: true }),
        rm(`${templateOutputPath}.partial`, { force: true }),
        rm(`${userOutputPath}.partial`, { force: true }),
      ]);
    }
  }

  private async requireFile(id: string): Promise<FileRecord> {
    const file = this.dependencies.files.getActive(id);
    if (!file) throw new Error(`FILE_NOT_FOUND: ${id}`);
    await access(this.dependencies.fileStore.resolvePath(file.relativePath));
    return file;
  }

  private stage(jobId: string, stage: string) {
    this.dependencies.jobs.transition(jobId, { status: 'running', stage });
  }

  private async storePath(
    path: string,
    kind: StoredFileKind,
    mimeType: string,
    originalName: string,
  ) {
    const stored = await this.dependencies.fileStore.write(createReadStream(path), {
      kind,
      originalName,
      maxBytes: this.dependencies.maxStoredBytes,
    });
    return this.registerStoredFile(stored, mimeType);
  }

  private async storeBuffer(
    buffer: Buffer,
    kind: StoredFileKind,
    mimeType: string,
    originalName: string,
  ) {
    const stored = await this.dependencies.fileStore.write(Readable.from([buffer]), {
      kind,
      originalName,
      maxBytes: this.dependencies.maxStoredBytes,
    });
    return this.registerStoredFile(stored, mimeType);
  }

  private registerStoredFile(
    stored: Awaited<ReturnType<FileStore['write']>>,
    mimeType: string,
  ) {
    const existing = this.dependencies.files
      .findActiveBySha256(stored.sha256)
      .find((file) => file.kind === stored.kind && file.relativePath === stored.relativePath);
    return (
      existing ??
      this.dependencies.files.create({
        sha256: stored.sha256,
        kind: stored.kind,
        originalName: stored.originalName,
        mimeType,
        sizeBytes: stored.sizeBytes,
        relativePath: stored.relativePath,
      })
    );
  }

  private rejection(codes: string[], report: QualityReport) {
    const code = codes[0] ?? report.rejectionCodes[0] ?? 'INPUT_REJECTED';
    return new AppError({
      code,
      category: 'rejection',
      message: `Input did not pass analysis: ${code}`,
      retryable: false,
      details: { rejectionCodes: codes.length ? codes : report.rejectionCodes },
    });
  }

  private finishWithError(job: JobRecord, error: unknown) {
    const current = this.dependencies.jobs.get(job.id);
    if (!current || !['queued', 'running'].includes(current.status)) return;
    const appError =
      error instanceof ComparisonRejected
        ? new AppError({
            code: error.code,
            category: 'rejection',
            message: error.message,
            retryable: false,
            details: error.details,
          })
        : error instanceof AppError
          ? error
          : new AppError({
              code: 'INTERNAL_PROCESSING_ERROR',
              category: 'system',
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
            });
    const payload = {
      code: appError.code,
      category: appError.category,
      message: appError.message,
      retryable: appError.retryable,
      ...(appError.details ? { details: appError.details } : {}),
    };
    if (appError.category === 'rejection') {
      if (job.type === 'template') {
        this.dependencies.templates.markRejected(job.entityId, appError.code, payload);
      } else {
        this.dependencies.comparisons.markRejected(job.entityId, appError.code, payload);
      }
      this.dependencies.jobs.transition(job.id, {
        status: 'rejected',
        stage: current.stage,
        error: payload,
      });
    } else {
      if (job.type === 'template') this.dependencies.templates.markFailed(job.entityId, payload);
      else this.dependencies.comparisons.markFailed(job.entityId, payload);
      this.dependencies.jobs.transition(job.id, {
        status: 'failed',
        stage: current.stage,
        error: payload,
      });
    }
  }
}
