import { type Static, Type } from '@sinclair/typebox';

import { JobStatusSchema, ShootingHandSchema } from './enums.ts';
import { ComparisonResultSchema } from './comparison-result.ts';
import { Landmark2DSchema, NormalizedLandmark2DSchema } from './motion-artifact.ts';

const closed = { additionalProperties: false } as const;

export const JobSummarySchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    type: Type.Union([Type.Literal('template'), Type.Literal('comparison')]),
    entityId: Type.String({ minLength: 1 }),
    status: JobStatusSchema,
    stage: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    completedStages: Type.Array(Type.String({ minLength: 1 })),
    attempt: Type.Integer({ minimum: 1 }),
    error: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    updatedAt: Type.String({ minLength: 1 }),
  },
  closed,
);

export const ReportFrameSchema = Type.Object(
  {
    sampleIndex: Type.Integer({ minimum: 0 }),
    templateVideoSkeleton: Type.Array(Landmark2DSchema),
    userVideoSkeleton: Type.Array(Landmark2DSchema),
    templateNormalizedSkeleton: Type.Array(NormalizedLandmark2DSchema),
    userNormalizedSkeleton: Type.Array(NormalizedLandmark2DSchema),
  },
  closed,
);

export const PresentationCompatibilitySchema = Type.Object(
  {
    level: Type.Union([
      Type.Literal('reliable'),
      Type.Literal('reference_only'),
      Type.Literal('side_by_side_only'),
    ]),
    reasons: Type.Array(Type.Union([
      Type.Literal('template_camera_unstable'),
      Type.Literal('user_camera_unstable'),
      Type.Literal('template_view_mismatch'),
      Type.Literal('user_view_mismatch'),
      Type.Literal('template_body_out_of_frame'),
      Type.Literal('user_body_out_of_frame'),
      Type.Literal('template_pose_unstable'),
      Type.Literal('user_pose_unstable'),
    ]), { uniqueItems: true }),
    modes: Type.Object(
      {
        sideBySide: Type.Literal('enabled'),
        skeletonOverlay: Type.Union([
          Type.Literal('enabled'),
          Type.Literal('reference_only'),
          Type.Literal('disabled'),
        ]),
        motionChannel: Type.Union([
          Type.Literal('enabled'),
          Type.Literal('reference_only'),
          Type.Literal('disabled'),
        ]),
      },
      closed,
    ),
  },
  closed,
);

export const ReportBundleSchema = Type.Object(
  {
    comparison: ComparisonResultSchema,
    template: Type.Object(
      {
        name: Type.String({ minLength: 1 }),
        shootingHand: ShootingHandSchema,
        previewVideoUrl: Type.String({ minLength: 1 }),
      },
      closed,
    ),
    user: Type.Object(
      {
        previewVideoUrl: Type.String({ minLength: 1 }),
      },
      closed,
    ),
    presentationCompatibility: PresentationCompatibilitySchema,
    renderFrames: Type.Array(ReportFrameSchema, { minItems: 1 }),
  },
  closed,
);

export type JobSummary = Static<typeof JobSummarySchema>;
export type ReportFrame = Static<typeof ReportFrameSchema>;
export type PresentationCompatibility = Static<typeof PresentationCompatibilitySchema>;
export type ReportBundle = Static<typeof ReportBundleSchema>;
