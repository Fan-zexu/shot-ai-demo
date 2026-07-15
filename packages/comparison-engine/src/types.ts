import type {
  BodyRegion,
  ComparisonResult,
  MotionArtifact,
  MotionEventName,
  MotionFrame,
  RegionDifferences,
} from '@shot-ai/contracts';

export interface FeatureWeights {
  angle: number;
  position: number;
  velocity: number;
}

export interface ComparisonThresholds {
  bandRatio: number;
  maxRepeatedOutputFrames: number;
  minFeatureCoverage: number;
  minAlignmentConfidence: number;
  maxBoundaryHitRatio: number;
  featureWeights: FeatureWeights;
  angleDeltaDeg: number;
  positionDelta: number;
  phaseDelta: number;
  minRegionConfidence: number;
  highlightPersistenceFrames: number;
  windowMergeGapFrames: number;
  channelRadiusByRegion: Record<BodyRegion, number>;
}

export type ComparisonThresholdOverrides = Partial<
  Omit<ComparisonThresholds, 'featureWeights' | 'channelRadiusByRegion'>
> & {
  featureWeights?: Partial<FeatureWeights>;
  channelRadiusByRegion?: Partial<Record<BodyRegion, number>>;
};

export interface CompareInput {
  comparisonId: string;
  template: MotionArtifact;
  user: MotionArtifact;
  templatePreviewFileId: string;
  userPreviewFileId: string;
  resultId?: string;
  createdAt?: string;
  thresholds?: ComparisonThresholdOverrides;
}

export interface CompatibilityResult {
  shootingHand: MotionArtifact['capture']['shootingHand'];
  templateView: MotionArtifact['capture']['detectedView'];
  userView: MotionArtifact['capture']['detectedView'];
  comparableRegions: BodyRegion[];
  unavailableRegions: Partial<Record<BodyRegion, string>>;
}

export interface PhaseFrames {
  index: number;
  startEvent: MotionEventName;
  endEvent: MotionEventName;
  templateFrames: MotionFrame[];
  userFrames: MotionFrame[];
}

export interface ScalarFeature {
  value: number;
  confidence: number;
}

export interface VectorFeature {
  x: number;
  y: number;
  confidence: number;
}

export interface FrameFeatures {
  angles: Record<string, ScalarFeature>;
  positions: Record<string, VectorFeature>;
  velocities: Record<string, VectorFeature>;
}

export interface DtwFrame {
  frameIndex: number;
  features: FrameFeatures;
}

export interface DtwPair {
  templateIndex: number;
  userIndex: number;
  localCost: number;
  featureCoverage: number;
  confidence: number;
  atBoundary: boolean;
}

export interface DtwResult {
  path: DtwPair[];
  averageCost: number;
  averageFeatureCoverage: number;
  boundaryHitRatio: number;
  confidence: number;
}

export interface AlignedPhase extends PhaseFrames {
  alignment: DtwResult;
}

export interface DifferenceDraft {
  differences: RegionDifferences;
  exceeded: Record<BodyRegion, boolean>;
}

export type ComparisonOutput = ComparisonResult;

export type ComparisonRejectionCode =
  | 'INVALID_SOURCE_TYPES'
  | 'HAND_MISMATCH'
  | 'VIEW_MISMATCH'
  | 'INVALID_EVENTS'
  | 'INSUFFICIENT_COMPARABLE_REGIONS'
  | 'LOW_ALIGNMENT_CONFIDENCE';

export class ComparisonRejected extends Error {
  constructor(
    readonly code: ComparisonRejectionCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = 'ComparisonRejected';
  }
}
