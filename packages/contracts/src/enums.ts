import { type Static, Type } from '@sinclair/typebox';

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

function literalUnion<const T extends readonly [string, ...string[]]>(values: T) {
  return Type.Union(values.map((value) => Type.Literal(value)));
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

export type ShootingHand = Static<typeof ShootingHandSchema>;
export type SourceType = Static<typeof SourceTypeSchema>;
export type ViewType = Static<typeof ViewTypeSchema>;
export type FacingDirection = Static<typeof FacingDirectionSchema>;
export type BodyRegion = Static<typeof BodyRegionSchema>;
export type MotionEventName = Static<typeof MotionEventNameSchema>;
export type QualityCheckStatus = Static<typeof QualityCheckStatusSchema>;
export type JobStatus = Static<typeof JobStatusSchema>;
export type PlaybackMode = Static<typeof PlaybackModeSchema>;

export const IdPrefix = {
  file: 'file_',
  template: 'tpl_',
  comparison: 'cmp_',
  job: 'job_',
  artifact: 'artifact_',
  result: 'result_',
} as const;

