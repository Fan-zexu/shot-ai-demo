import { type Static, Type, type TSchema } from '@sinclair/typebox';

import {
  BodyRegionSchema,
  FacingDirectionSchema,
  QualityCheckStatusSchema,
  ShootingHandSchema,
  SourceTypeSchema,
  ViewTypeSchema,
} from './enums.ts';

const closed = { additionalProperties: false } as const;
const confidence = () => Type.Number({ minimum: 0, maximum: 1 });
const nonNegative = () => Type.Number({ minimum: 0 });
const timestamp = () => Type.String({ minLength: 1 });
const sha256 = () => Type.String({ pattern: '^[a-f0-9]{64}$' });

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

export const ThresholdValueSchema = Type.Union([
  Type.Number(),
  Type.String(),
  Type.Boolean(),
]);
export const ThresholdSnapshotSchema = Type.Record(Type.String(), ThresholdValueSchema);
export const NumericRecordSchema = Type.Record(Type.String(), Type.Number());

export const Landmark2DSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    x: Type.Number(),
    y: Type.Number(),
    z: Type.Optional(Type.Number()),
    visibility: confidence(),
    presence: confidence(),
  },
  closed,
);

export const NormalizedLandmark2DSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    x: Type.Number(),
    y: Type.Number(),
    confidence: confidence(),
  },
  closed,
);

export const RegionConfidenceSchema = regionRecord(confidence());
export const RejectedRegionsSchema = Type.Partial(regionRecord(Type.String({ minLength: 1 })));

export const MotionFrameSchema = Type.Object(
  {
    frameIndex: Type.Integer({ minimum: 0 }),
    timestampMs: nonNegative(),
    poseConfidence: confidence(),
    landmarks: Type.Array(Landmark2DSchema),
    normalizedLandmarks: Type.Array(NormalizedLandmark2DSchema),
    retargetedLandmarks: Type.Array(NormalizedLandmark2DSchema),
    jointAnglesDeg: Type.Record(Type.String(), Type.Union([Type.Number(), Type.Null()])),
    regionConfidence: RegionConfidenceSchema,
  },
  closed,
);

export const QualityCheckSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    status: QualityCheckStatusSchema,
    measuredValue: Type.Optional(ThresholdValueSchema),
    threshold: Type.Optional(ThresholdValueSchema),
    evidenceFrameIndices: Type.Optional(Type.Array(Type.Integer({ minimum: 0 }))),
    message: Type.String({ minLength: 1 }),
  },
  closed,
);

export const QualityReportSchema = Type.Object(
  {
    schemaVersion: Type.Literal('1.0'),
    sourceFileId: Type.String({ minLength: 1 }),
    sourceType: SourceTypeSchema,
    status: Type.Union([Type.Literal('accepted'), Type.Literal('rejected')]),
    checks: Type.Array(QualityCheckSchema),
    overallPoseConfidence: Type.Optional(confidence()),
    comparableRegions: Type.Array(BodyRegionSchema, { uniqueItems: true }),
    rejectedRegions: RejectedRegionsSchema,
    rejectionCodes: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    createdAt: timestamp(),
  },
  closed,
);

function eventSchema<Name extends string, Proxy extends boolean>(name: Name, isProxy: Proxy) {
  return Type.Object(
    {
      name: Type.Literal(name),
      frameIndex: Type.Integer({ minimum: 0 }),
      timestampMs: nonNegative(),
      confidence: confidence(),
      evidence: NumericRecordSchema,
      isProxy: Type.Literal(isProxy),
    },
    closed,
  );
}

export const MotionEventsSchema = Type.Object(
  {
    prep_start: eventSchema('prep_start', false),
    body_lowest: eventSchema('body_lowest', false),
    lower_body_extension_start: eventSchema('lower_body_extension_start', false),
    shooting_arm_lift: eventSchema('shooting_arm_lift', false),
    release_pose_proxy: eventSchema('release_pose_proxy', true),
    follow_through_end: eventSchema('follow_through_end', false),
  },
  closed,
);

export const MotionArtifactSchema = Type.Object(
  {
    schemaVersion: Type.Literal('1.0'),
    artifactId: Type.String({ minLength: 1 }),
    sourceType: SourceTypeSchema,
    sourceFileId: Type.String({ minLength: 1 }),
    sourceSha256: sha256(),
    createdAt: timestamp(),
    video: Type.Object(
      {
        durationMs: nonNegative(),
        width: Type.Integer({ minimum: 1 }),
        height: Type.Integer({ minimum: 1 }),
        rotationDeg: Type.Number(),
        nominalFps: Type.Number({ exclusiveMinimum: 0 }),
        frameCount: Type.Integer({ minimum: 1 }),
        container: Type.String({ minLength: 1 }),
        codec: Type.String({ minLength: 1 }),
      },
      closed,
    ),
    capture: Type.Object(
      {
        shootingHand: ShootingHandSchema,
        detectedView: ViewTypeSchema,
        facingDirection: FacingDirectionSchema,
        normalSpeedConfirmed: Type.Boolean(),
      },
      closed,
    ),
    quality: Type.Object(
      {
        checks: Type.Array(QualityCheckSchema),
        overallPoseConfidence: confidence(),
        comparableRegions: Type.Array(BodyRegionSchema, { uniqueItems: true }),
        rejectedRegions: RejectedRegionsSchema,
      },
      closed,
    ),
    events: MotionEventsSchema,
    frames: Type.Array(MotionFrameSchema, { minItems: 1 }),
    canonicalSkeleton: Type.Object(
      {
        segmentLengths: Type.Record(Type.String(), Type.Number({ exclusiveMinimum: 0 })),
        root: Type.Literal('hip_center'),
        scaleBasis: Type.Literal('torso_length'),
        facingDirection: Type.Literal('right'),
      },
      closed,
    ),
    provenance: Type.Object(
      {
        modelName: Type.String({ minLength: 1 }),
        modelVersion: Type.String({ minLength: 1 }),
        modelSha256: sha256(),
        pipelineVersion: Type.String({ minLength: 1 }),
        thresholdSnapshot: ThresholdSnapshotSchema,
        runtime: Type.String({ minLength: 1 }),
        stageDurationsMs: NumericRecordSchema,
      },
      closed,
    ),
  },
  closed,
);

export type Landmark2D = Static<typeof Landmark2DSchema>;
export type NormalizedLandmark2D = Static<typeof NormalizedLandmark2DSchema>;
export type MotionFrame = Static<typeof MotionFrameSchema>;
export type QualityCheck = Static<typeof QualityCheckSchema>;
export type QualityReport = Static<typeof QualityReportSchema>;
export type MotionEvents = Static<typeof MotionEventsSchema>;
export type MotionArtifact = Static<typeof MotionArtifactSchema>;
export type ThresholdSnapshot = Static<typeof ThresholdSnapshotSchema>;

