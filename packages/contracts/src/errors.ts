import { type Static, Type } from '@sinclair/typebox';

const closed = { additionalProperties: false } as const;

export const ErrorCodes = [
  'USER_BODY_OUT_OF_FRAME',
  'USER_NOT_SIDE_VIEW',
  'HAND_MISMATCH',
  'LOW_POSE_CONFIDENCE',
  'INCOMPLETE_ACTION',
  'ABNORMAL_VIDEO_TIMING',
  'MULTIPLE_ACTIONS_DETECTED',
  'AMBIGUOUS_PERSON_TRACK',
  'INSUFFICIENT_COMPARABLE_REGIONS',
  'WORKER_UNAVAILABLE',
  'PROCESSING_TIMEOUT',
  'ARTIFACT_SCHEMA_INVALID',
  'PREVIEW_GENERATION_FAILED',
  'STORAGE_WRITE_FAILED',
  'JOB_NOT_RETRYABLE',
  'INVALID_JOB_TRANSITION',
  'PATH_OUTSIDE_DATA_ROOT',
] as const;

export const ApiErrorSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    category: Type.Union([
      Type.Literal('validation'),
      Type.Literal('rejection'),
      Type.Literal('system'),
    ]),
    message: Type.String({ minLength: 1 }),
    retryable: Type.Boolean(),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    evidenceFrameIndices: Type.Optional(Type.Array(Type.Integer({ minimum: 0 }))),
    requestId: Type.String({ minLength: 1 }),
  },
  closed,
);

export type ErrorCode = (typeof ErrorCodes)[number];
export type ApiError = Static<typeof ApiErrorSchema>;

