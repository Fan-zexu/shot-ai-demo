import type {
  MotionArtifact,
  PresentationCompatibility,
  QualityCheck,
} from '@shot-ai/contracts';

type Reason = PresentationCompatibility['reasons'][number];
type Source = 'template' | 'user';

export function assessPresentationCompatibility(
  template: MotionArtifact,
  user: MotionArtifact,
): PresentationCompatibility {
  const hardReasons: Reason[] = [];
  const softReasons: Reason[] = [];
  assessArtifact('template', template, hardReasons, softReasons);
  assessArtifact('user', user, hardReasons, softReasons);

  const reasons = unique([...hardReasons, ...softReasons]);
  if (hardReasons.length > 0) {
    return {
      level: 'side_by_side_only',
      reasons,
      modes: { sideBySide: 'enabled', skeletonOverlay: 'disabled', motionChannel: 'disabled' },
    };
  }
  if (softReasons.length > 0) {
    return {
      level: 'reference_only',
      reasons,
      modes: {
        sideBySide: 'enabled',
        skeletonOverlay: 'reference_only',
        motionChannel: 'reference_only',
      },
    };
  }
  return {
    level: 'reliable',
    reasons: [],
    modes: { sideBySide: 'enabled', skeletonOverlay: 'enabled', motionChannel: 'enabled' },
  };
}

function assessArtifact(
  source: Source,
  artifact: MotionArtifact,
  hardReasons: Reason[],
  softReasons: Reason[],
) {
  const checks = new Map(artifact.quality.checks.map((check) => [check.code, check]));
  const sideView = checks.get('SIDE_VIEW');
  if (artifact.capture.detectedView !== 'shooting_side' || isConcern(sideView)) {
    hardReasons.push(reason(source, 'view_mismatch'));
  }

  const coverage = checks.get('REQUIRED_LANDMARK_COVERAGE');
  const gap = checks.get('MAX_CONSECUTIVE_MISSING_FRAMES');
  if (isConcern(coverage) || isConcern(gap)) {
    const measuredCoverage = numericValue(coverage);
    const target = measuredCoverage !== null && measuredCoverage < 0.75 ? hardReasons : softReasons;
    target.push(reason(source, 'body_out_of_frame'));
  }

  const pose = checks.get('POSE_CONFIDENCE');
  const poseConfidence = numericValue(pose) ?? artifact.quality.overallPoseConfidence;
  if (isConcern(pose) || poseConfidence < 0.6) {
    const target = poseConfidence < 0.5 ? hardReasons : softReasons;
    target.push(reason(source, 'pose_unstable'));
  }

  if (isConcern(checks.get('CAMERA_STABILITY'))) {
    softReasons.push(reason(source, 'camera_unstable'));
  }
}

function isConcern(check: QualityCheck | undefined) {
  return check !== undefined && check.status !== 'pass' && check.status !== 'not_applicable';
}

function numericValue(check: QualityCheck | undefined) {
  return typeof check?.measuredValue === 'number' ? check.measuredValue : null;
}

function reason(
  source: Source,
  issue: 'camera_unstable' | 'view_mismatch' | 'body_out_of_frame' | 'pose_unstable',
): Reason {
  return `${source}_${issue}`;
}

function unique(values: Reason[]) {
  return [...new Set(values)];
}
