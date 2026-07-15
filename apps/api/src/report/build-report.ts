import {
  ComparisonResultSchema,
  MotionArtifactSchema,
  ReportBundleSchema,
  type MotionArtifact,
  type ReportBundle,
} from '@shot-ai/contracts';
import { retargetPair } from '@shot-ai/comparison-engine';

import { assertSchema, readGzipArtifact } from '../artifacts/io.ts';
import { appError } from '../http/errors.ts';
import type { AppServices } from '../services.ts';

async function loadArtifact(services: AppServices, id: string): Promise<MotionArtifact> {
  const record = services.artifacts.get(id);
  if (!record) throw appError('ARTIFACT_NOT_FOUND', `Artifact ${id} was not found`);
  const file = services.files.getActive(record.artifactFileId);
  if (!file) throw appError('FILE_NOT_FOUND', `Artifact file ${record.artifactFileId} was not found`);
  return readGzipArtifact(
    services.fileStore.resolvePath(file.relativePath),
    MotionArtifactSchema,
  );
}

export async function buildReportBundle(
  services: AppServices,
  comparisonId: string,
): Promise<{ bundle: ReportBundle; etag: string }> {
  const comparison = services.comparisons.getActive(comparisonId);
  if (!comparison) throw appError('COMPARISON_NOT_FOUND', `Comparison ${comparisonId} was not found`);
  if (comparison.status !== 'ready' || !comparison.resultId || !comparison.userArtifactId || !comparison.templateArtifactId) {
    throw appError('REPORT_NOT_READY', 'Comparison report is not ready');
  }
  const template = services.templates.get(comparison.templateId);
  const resultRecord = services.results.get(comparison.resultId);
  if (!template || !resultRecord) throw appError('REPORT_NOT_FOUND', 'Stored report metadata is incomplete');
  const resultFile = services.files.getActive(resultRecord.resultFileId);
  if (!resultFile) throw appError('FILE_NOT_FOUND', 'Stored comparison result file was not found');
  const result = await readGzipArtifact(
    services.fileStore.resolvePath(resultFile.relativePath),
    ComparisonResultSchema,
  );
  const pair = retargetPair(
    await loadArtifact(services, comparison.templateArtifactId),
    await loadArtifact(services, comparison.userArtifactId),
  );
  const templateFrames = new Map(pair.template.frames.map((frame) => [frame.frameIndex, frame]));
  const userFrames = new Map(pair.user.frames.map((frame) => [frame.frameIndex, frame]));
  const bundle: ReportBundle = {
    comparison: result,
    template: {
      name: template.name,
      shootingHand: template.shootingHand,
      previewVideoUrl: `/api/v1/files/${result.previews.templateVideoFileId}/video`,
    },
    user: {
      previewVideoUrl: `/api/v1/files/${result.previews.userVideoFileId}/video`,
    },
    renderFrames: result.renderTimeline.map((sample) => {
      const templateFrame = templateFrames.get(sample.templateFrameIndex);
      const userFrame = userFrames.get(sample.userFrameIndex);
      if (!templateFrame || !userFrame) {
        throw appError('ARTIFACT_SCHEMA_INVALID', 'Timeline references a missing motion frame', {
          category: 'system',
          details: { sampleIndex: sample.sampleIndex },
        });
      }
      return {
        sampleIndex: sample.sampleIndex,
        templateVideoSkeleton: templateFrame.landmarks,
        userVideoSkeleton: userFrame.landmarks,
        templateNormalizedSkeleton: templateFrame.retargetedLandmarks,
        userNormalizedSkeleton: userFrame.retargetedLandmarks,
      };
    }),
  };
  assertSchema(ReportBundleSchema, bundle, 'ARTIFACT_SCHEMA_INVALID');
  return { bundle, etag: `"${resultRecord.resultSha256}"` };
}
