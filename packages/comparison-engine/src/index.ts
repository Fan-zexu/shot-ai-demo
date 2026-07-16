import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type { ComparisonResult } from '@shot-ai/contracts';

import { checkCompatibility } from './compatibility/check.ts';
import { resolveThresholds, thresholdSnapshot } from './config.ts';
import { applyHighlightPersistence } from './differences/highlights.ts';
import { mergeDeviationWindows } from './differences/windows.ts';
import { constrainedDtw } from './dtw/constrained-dtw.ts';
import { extractFrameFeatures } from './features/extract.ts';
import { splitPhases } from './phases/split.ts';
import { retargetPair } from './retarget/pair.ts';
import { buildTimeline } from './timeline/build.ts';
import {
  ComparisonRejected,
  type AlignedPhase,
  type CompareInput,
  type ComparisonOutput,
} from './types.ts';

export * from './compatibility/check.ts';
export * from './config.ts';
export * from './differences/highlights.ts';
export * from './differences/regions.ts';
export * from './differences/windows.ts';
export * from './dtw/constrained-dtw.ts';
export * from './features/cost.ts';
export * from './features/extract.ts';
export * from './features/regions.ts';
export * from './phases/split.ts';
export * from './retarget/pair.ts';
export * from './timeline/build.ts';
export * from './types.ts';

function resultId() {
  return `result_${randomUUID().replaceAll('-', '')}`;
}

function minimumRepeatLimit(firstLength: number, secondLength: number) {
  // This is the smallest run length that can span the denser phase while both
  // start/end events remain hard anchors on the sparser phase.
  const shorterSteps = Math.max(1, Math.min(firstLength, secondLength) - 1);
  const longerSteps = Math.max(firstLength, secondLength) - 1;
  return Math.ceil(longerSteps / shorterSteps);
}

export function compareMotions(input: CompareInput): ComparisonOutput {
  const started = performance.now();
  const resolvedThresholds = resolveThresholds(input.thresholds);
  const timingComparable =
    input.template.capture.normalSpeedConfirmed &&
    input.user.capture.normalSpeedConfirmed;
  const thresholds = timingComparable
    ? resolvedThresholds
    : {
        ...resolvedThresholds,
        // An unconfirmed or speed-ramped source keeps pose geometry, but its
        // timestamp-derived velocity is not the shooter's real velocity.
        featureWeights: {
          ...resolvedThresholds.featureWeights,
          velocity: 0,
        },
      };
  const compatibility = checkCompatibility(input.template, input.user);
  const retargeted = retargetPair(input.template, input.user);
  const phases = splitPhases(retargeted.template, retargeted.user);
  const alignedPhases: AlignedPhase[] = phases.map((phase) => {
    let alignment;
    try {
      const repeatLimit = timingComparable
        ? thresholds.maxRepeatedOutputFrames
        : Math.max(
            thresholds.maxRepeatedOutputFrames,
            minimumRepeatLimit(
              phase.templateFrames.length,
              phase.userFrames.length,
            ),
          );
      alignment = constrainedDtw({
        template: extractFrameFeatures(
          phase.templateFrames,
          compatibility.comparableRegions,
          compatibility.shootingHand,
        ),
        user: extractFrameFeatures(
          phase.userFrames,
          compatibility.comparableRegions,
          compatibility.shootingHand,
        ),
        bandRatio: thresholds.bandRatio,
        maxRepeatedOutputFrames: repeatLimit,
        weights: thresholds.featureWeights,
      });
    } catch (error) {
      throw new ComparisonRejected(
        'LOW_ALIGNMENT_CONFIDENCE',
        'a constrained phase path could not be produced',
        { phaseIndex: phase.index, cause: error instanceof Error ? error.message : String(error) },
      );
    }
    if (
      alignment.averageFeatureCoverage < thresholds.minFeatureCoverage ||
      alignment.boundaryHitRatio > thresholds.maxBoundaryHitRatio ||
      alignment.confidence < thresholds.minAlignmentConfidence
    ) {
      throw new ComparisonRejected(
        'LOW_ALIGNMENT_CONFIDENCE',
        'phase alignment did not meet coverage or path confidence thresholds',
        {
          phaseIndex: phase.index,
          averageFeatureCoverage: alignment.averageFeatureCoverage,
          boundaryHitRatio: alignment.boundaryHitRatio,
          confidence: alignment.confidence,
        },
      );
    }
    return { ...phase, alignment };
  });
  const built = buildTimeline({
    alignedPhases,
    shootingHand: compatibility.shootingHand,
    comparableRegions: compatibility.comparableRegions,
    thresholds,
  });
  const renderTimeline = applyHighlightPersistence(built.timeline, thresholds);
  const elapsed = performance.now() - started;
  const result: ComparisonResult = {
    schemaVersion: '1.0',
    resultId: input.resultId ?? resultId(),
    comparisonId: input.comparisonId,
    templateArtifactId: input.template.artifactId,
    userArtifactId: input.user.artifactId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    compatibility,
    phases: built.phases,
    renderTimeline,
    deviationWindows: mergeDeviationWindows(
      renderTimeline,
      thresholds.windowMergeGapFrames,
    ),
    visualization: {
      channelRadiusByRegion: thresholds.channelRadiusByRegion,
      highlightPersistenceFrames: thresholds.highlightPersistenceFrames,
    },
    previews: {
      fps: 30,
      frameCount: renderTimeline.length,
      durationMs: (renderTimeline.length * 1000) / 30,
      templateVideoFileId: input.templatePreviewFileId,
      userVideoFileId: input.userPreviewFileId,
    },
    provenance: {
      comparisonAlgorithmVersion: '1.0.0',
      thresholdSnapshot: thresholdSnapshot(thresholds),
      stageDurationsMs: { compare: Number(elapsed.toFixed(3)) },
    },
  };
  return result;
}
