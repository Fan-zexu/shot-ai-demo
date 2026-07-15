import { type Static, Type } from '@sinclair/typebox';

import { JobStatusSchema, ShootingHandSchema } from './enums.ts';
import { ComparisonResultSchema } from './comparison-result.ts';
import { Landmark2DSchema, NormalizedLandmark2DSchema } from './motion-artifact.ts';

const closed = { additionalProperties: false } as const;

export const JobSummarySchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
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
    renderFrames: Type.Array(ReportFrameSchema, { minItems: 1 }),
  },
  closed,
);

export type JobSummary = Static<typeof JobSummarySchema>;
export type ReportFrame = Static<typeof ReportFrameSchema>;
export type ReportBundle = Static<typeof ReportBundleSchema>;

