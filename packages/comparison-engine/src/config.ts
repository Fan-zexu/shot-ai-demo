import { BodyRegions, type BodyRegion } from '@shot-ai/contracts';

import type {
  ComparisonThresholdOverrides,
  ComparisonThresholds,
} from './types.ts';

const allRegions = BodyRegions as readonly BodyRegion[];

const regionValues = (value: number): Record<BodyRegion, number> =>
  Object.fromEntries(allRegions.map((region) => [region, value])) as Record<
    BodyRegion,
    number
  >;

export const DEFAULT_COMPARISON_THRESHOLDS: ComparisonThresholds = {
  bandRatio: 0.15,
  maxRepeatedOutputFrames: 4,
  minFeatureCoverage: 0.55,
  minAlignmentConfidence: 0.35,
  maxBoundaryHitRatio: 0.5,
  featureWeights: {
    angle: 0.5,
    position: 0.3,
    velocity: 0.2,
  },
  angleDeltaDeg: 10,
  positionDelta: 0.08,
  phaseDelta: 0.08,
  minRegionConfidence: 0.6,
  highlightPersistenceFrames: 3,
  windowMergeGapFrames: 2,
  channelRadiusByRegion: regionValues(0.08),
};

function requireRange(name: string, value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be between ${minimum} and ${maximum}`);
  }
}

export function resolveThresholds(
  overrides: ComparisonThresholdOverrides = {},
): ComparisonThresholds {
  const thresholds: ComparisonThresholds = {
    ...DEFAULT_COMPARISON_THRESHOLDS,
    ...overrides,
    featureWeights: {
      ...DEFAULT_COMPARISON_THRESHOLDS.featureWeights,
      ...overrides.featureWeights,
    },
    channelRadiusByRegion: Object.fromEntries(
      allRegions.map((region) => [
        region,
        overrides.channelRadiusByRegion?.[region] ??
          DEFAULT_COMPARISON_THRESHOLDS.channelRadiusByRegion[region],
      ]),
    ) as Record<BodyRegion, number>,
  };
  requireRange('bandRatio', thresholds.bandRatio, 0, 1);
  requireRange('minFeatureCoverage', thresholds.minFeatureCoverage, 0, 1);
  requireRange('minAlignmentConfidence', thresholds.minAlignmentConfidence, 0, 1);
  requireRange('maxBoundaryHitRatio', thresholds.maxBoundaryHitRatio, 0, 1);
  requireRange('minRegionConfidence', thresholds.minRegionConfidence, 0, 1);
  if (!Number.isInteger(thresholds.maxRepeatedOutputFrames) || thresholds.maxRepeatedOutputFrames < 1) {
    throw new TypeError('maxRepeatedOutputFrames must be a positive integer');
  }
  if (!Number.isInteger(thresholds.highlightPersistenceFrames) || thresholds.highlightPersistenceFrames < 1) {
    throw new TypeError('highlightPersistenceFrames must be a positive integer');
  }
  if (!Number.isInteger(thresholds.windowMergeGapFrames) || thresholds.windowMergeGapFrames < 0) {
    throw new TypeError('windowMergeGapFrames must be a non-negative integer');
  }
  const weightSum = Object.values(thresholds.featureWeights).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (weightSum <= 0 || Object.values(thresholds.featureWeights).some((value) => value < 0)) {
    throw new TypeError('feature weights must be non-negative and not all zero');
  }
  for (const [region, radius] of Object.entries(thresholds.channelRadiusByRegion)) {
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new TypeError(`channel radius for ${region} must be positive`);
    }
  }
  return thresholds;
}

export function thresholdSnapshot(thresholds: ComparisonThresholds) {
  return {
    bandRatio: thresholds.bandRatio,
    maxRepeatedOutputFrames: thresholds.maxRepeatedOutputFrames,
    minFeatureCoverage: thresholds.minFeatureCoverage,
    minAlignmentConfidence: thresholds.minAlignmentConfidence,
    maxBoundaryHitRatio: thresholds.maxBoundaryHitRatio,
    angleWeight: thresholds.featureWeights.angle,
    positionWeight: thresholds.featureWeights.position,
    velocityWeight: thresholds.featureWeights.velocity,
    angleDeltaDeg: thresholds.angleDeltaDeg,
    positionDelta: thresholds.positionDelta,
    phaseDelta: thresholds.phaseDelta,
    minRegionConfidence: thresholds.minRegionConfidence,
    highlightPersistenceFrames: thresholds.highlightPersistenceFrames,
    windowMergeGapFrames: thresholds.windowMergeGapFrames,
    ...Object.fromEntries(
      allRegions.map((region) => [
        `channelRadius.${region}`,
        thresholds.channelRadiusByRegion[region],
      ]),
    ),
  };
}
