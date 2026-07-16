import { type Static, Type, type TSchema } from '@sinclair/typebox';

import {
  BodyRegionSchema,
  MotionEventNameSchema,
  ShootingHandSchema,
  ViewTypeSchema,
} from './enums.ts';
import {
  NumericRecordSchema,
  RejectedRegionsSchema,
  ThresholdSnapshotSchema,
} from './motion-artifact.ts';

const closed = { additionalProperties: false } as const;
const confidence = () => Type.Number({ minimum: 0, maximum: 1 });
const nullableNumber = () => Type.Union([Type.Number(), Type.Null()]);

function regionRecord<T extends TSchema>(value: T) {
  return Type.Object(
    {
      lower_body: value,
      torso: value,
      shooting_arm: value,
      guide_arm: value,
      whole_body_timing: value,
    },
    closed,
  );
}

export const RegionDifferenceSchema = Type.Object(
  {
    angleDeltaDeg: nullableNumber(),
    positionDelta: nullableNumber(),
    templatePhaseProgress: Type.Union([confidence(), Type.Null()]),
    userPhaseProgress: Type.Union([confidence(), Type.Null()]),
    phaseDelta: Type.Union([Type.Number({ minimum: -1, maximum: 1 }), Type.Null()]),
    confidence: confidence(),
    comparable: Type.Boolean(),
    highlighted: Type.Boolean(),
  },
  closed,
);

export const RegionDifferencesSchema = regionRecord(RegionDifferenceSchema);

export const TimelineSampleSchema = Type.Object(
  {
    sampleIndex: Type.Integer({ minimum: 0 }),
    progress: confidence(),
    phaseIndex: Type.Integer({ minimum: 0, maximum: 4 }),
    phaseProgress: confidence(),
    templateFrameIndex: Type.Integer({ minimum: 0 }),
    templateTimestampMs: Type.Number({ minimum: 0 }),
    userFrameIndex: Type.Integer({ minimum: 0 }),
    userTimestampMs: Type.Number({ minimum: 0 }),
    differences: RegionDifferencesSchema,
  },
  closed,
);

export const DisplayTimelineSampleSchema = Type.Object(
  {
    displayFrameIndex: Type.Integer({ minimum: 0 }),
    displayTimestampMs: Type.Number({ minimum: 0 }),
    alignmentSampleIndex: Type.Integer({ minimum: 0 }),
  },
  closed,
);

export const DeviationWindowSchema = Type.Object(
  {
    region: BodyRegionSchema,
    startSampleIndex: Type.Integer({ minimum: 0 }),
    endSampleIndex: Type.Integer({ minimum: 0 }),
    maxAngleDeltaDeg: nullableNumber(),
    maxPositionDelta: nullableNumber(),
    minConfidence: confidence(),
  },
  closed,
);

export const ComparisonResultSchema = Type.Object(
  {
    schemaVersion: Type.Literal('1.0'),
    resultId: Type.String({ minLength: 1 }),
    comparisonId: Type.String({ minLength: 1 }),
    templateArtifactId: Type.String({ minLength: 1 }),
    userArtifactId: Type.String({ minLength: 1 }),
    createdAt: Type.String({ minLength: 1 }),
    compatibility: Type.Object(
      {
        shootingHand: ShootingHandSchema,
        templateView: ViewTypeSchema,
        userView: ViewTypeSchema,
        comparableRegions: Type.Array(BodyRegionSchema, { uniqueItems: true }),
        unavailableRegions: RejectedRegionsSchema,
      },
      closed,
    ),
    phases: Type.Array(
      Type.Object(
        {
          index: Type.Integer({ minimum: 0, maximum: 4 }),
          startEvent: MotionEventNameSchema,
          endEvent: MotionEventNameSchema,
          startSampleIndex: Type.Integer({ minimum: 0 }),
          endSampleIndex: Type.Integer({ minimum: 0 }),
        },
        closed,
      ),
      { minItems: 5, maxItems: 5 },
    ),
    renderTimeline: Type.Array(TimelineSampleSchema, { minItems: 1 }),
    // Added as an optional, backwards-compatible field so immutable reports
    // generated before the display clock existed remain readable.
    displayTimeline: Type.Optional(Type.Array(DisplayTimelineSampleSchema, { minItems: 1 })),
    deviationWindows: Type.Array(DeviationWindowSchema),
    visualization: Type.Object(
      {
        channelRadiusByRegion: regionRecord(Type.Number({ exclusiveMinimum: 0 })),
        highlightPersistenceFrames: Type.Integer({ minimum: 1 }),
      },
      closed,
    ),
    previews: Type.Object(
      {
        fps: Type.Literal(30),
        frameCount: Type.Integer({ minimum: 1 }),
        durationMs: Type.Number({ exclusiveMinimum: 0 }),
        templateVideoFileId: Type.String({ minLength: 1 }),
        userVideoFileId: Type.String({ minLength: 1 }),
      },
      closed,
    ),
    provenance: Type.Object(
      {
        comparisonAlgorithmVersion: Type.String({ minLength: 1 }),
        thresholdSnapshot: ThresholdSnapshotSchema,
        stageDurationsMs: NumericRecordSchema,
      },
      closed,
    ),
  },
  closed,
);

export type RegionDifference = Static<typeof RegionDifferenceSchema>;
export type RegionDifferences = Static<typeof RegionDifferencesSchema>;
export type TimelineSample = Static<typeof TimelineSampleSchema>;
export type DisplayTimelineSample = Static<typeof DisplayTimelineSampleSchema>;
export type DeviationWindow = Static<typeof DeviationWindowSchema>;
export type ComparisonResult = Static<typeof ComparisonResultSchema>;
