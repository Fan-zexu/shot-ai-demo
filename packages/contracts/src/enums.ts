import { Type, type TLiteral, type TUnion } from '@sinclair/typebox';

export const ShootingHands = ['left', 'right'] as const;
export const SourceTypes = ['template', 'user'] as const;
export const ViewTypes = [
  'shooting_side',
  'opposite_side',
  'front',
  'back',
  'oblique',
  'unknown',
] as const;
export const FacingDirections = ['left', 'right', 'unknown'] as const;
export const BodyRegions = [
  'lower_body',
  'torso',
  'shooting_arm',
  'guide_arm',
  'whole_body_timing',
] as const;
export const MotionEventNames = [
  'prep_start',
  'body_lowest',
  'lower_body_extension_start',
  'shooting_arm_lift',
  'release_pose_proxy',
  'follow_through_end',
] as const;
export const QualityCheckStatuses = ['pass', 'fail', 'warning', 'not_applicable'] as const;
export const JobStatuses = ['queued', 'running', 'ready', 'rejected', 'failed'] as const;
export const PlaybackModes = ['side_by_side', 'skeleton_overlay', 'motion_channel'] as const;

type LiteralTuple<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? [TLiteral<Head>, ...LiteralTuple<Tail>]
  : [];

function literalUnion<const T extends readonly [string, ...string[]]>(
  values: T,
): TUnion<LiteralTuple<T>> {
  return Type.Union(
    values.map((value) => Type.Literal(value)) as unknown as LiteralTuple<T>,
  ) as unknown as TUnion<LiteralTuple<T>>;
}

export const ShootingHandSchema = literalUnion(ShootingHands);
export const SourceTypeSchema = literalUnion(SourceTypes);
export const ViewTypeSchema = literalUnion(ViewTypes);
export const FacingDirectionSchema = literalUnion(FacingDirections);
export const BodyRegionSchema = literalUnion(BodyRegions);
export const MotionEventNameSchema = literalUnion(MotionEventNames);
export const QualityCheckStatusSchema = literalUnion(QualityCheckStatuses);
export const JobStatusSchema = literalUnion(JobStatuses);
export const PlaybackModeSchema = literalUnion(PlaybackModes);

// Derive application types from the source tuples. The TypeBox schemas remain
// the runtime validators, while these aliases retain exact literal unions.
export type ShootingHand = (typeof ShootingHands)[number];
export type SourceType = (typeof SourceTypes)[number];
export type ViewType = (typeof ViewTypes)[number];
export type FacingDirection = (typeof FacingDirections)[number];
export type BodyRegion = (typeof BodyRegions)[number];
export type MotionEventName = (typeof MotionEventNames)[number];
export type QualityCheckStatus = (typeof QualityCheckStatuses)[number];
export type JobStatus = (typeof JobStatuses)[number];
export type PlaybackMode = (typeof PlaybackModes)[number];

export const IdPrefix = {
  file: 'file_',
  template: 'tpl_',
  comparison: 'cmp_',
  job: 'job_',
  artifact: 'artifact_',
  result: 'result_',
} as const;
