import {
  BodyRegions,
  MotionEventNames,
  type BodyRegion,
  type MotionArtifact,
} from '@shot-ai/contracts';

import {
  ComparisonRejected,
  type CompatibilityResult,
} from '../types.ts';

const requiredRegions: BodyRegion[] = [
  'lower_body',
  'shooting_arm',
  'whole_body_timing',
];
const allRegions = BodyRegions as readonly BodyRegion[];

function validateEvents(artifact: MotionArtifact, label: string) {
  const frameIndices = MotionEventNames.map((name) => artifact.events[name].frameIndex);
  const ordered = frameIndices.every(
    (frameIndex, index) => index === 0 || frameIndex > frameIndices[index - 1]!,
  );
  const availableFrames = new Set(artifact.frames.map((frame) => frame.frameIndex));
  const anchored = frameIndices.every((frameIndex) => availableFrames.has(frameIndex));
  if (!ordered || !anchored) {
    throw new ComparisonRejected(
      'INVALID_EVENTS',
      `${label} events must be ordered and reference analyzed frames`,
      { artifactId: artifact.artifactId, frameIndices, ordered, anchored },
    );
  }
}

function unavailableReason(
  region: BodyRegion,
  template: MotionArtifact,
  user: MotionArtifact,
) {
  return (
    template.quality.rejectedRegions[region] ??
    user.quality.rejectedRegions[region] ??
    'region is not comparable in both motion artifacts'
  );
}

export function checkCompatibility(
  template: MotionArtifact,
  user: MotionArtifact,
): CompatibilityResult {
  if (template.sourceType !== 'template' || user.sourceType !== 'user') {
    throw new ComparisonRejected(
      'INVALID_SOURCE_TYPES',
      'comparison requires one template artifact and one user artifact',
      { templateSourceType: template.sourceType, userSourceType: user.sourceType },
    );
  }
  if (template.capture.shootingHand !== user.capture.shootingHand) {
    throw new ComparisonRejected('HAND_MISMATCH', 'shooting hands must match', {
      template: template.capture.shootingHand,
      user: user.capture.shootingHand,
    });
  }
  if (
    template.capture.detectedView !== 'shooting_side' ||
    user.capture.detectedView !== 'shooting_side'
  ) {
    throw new ComparisonRejected(
      'VIEW_MISMATCH',
      'both videos must show the shooting-hand side',
      {
        template: template.capture.detectedView,
        user: user.capture.detectedView,
      },
    );
  }
  validateEvents(template, 'template');
  validateEvents(user, 'user');

  const templateRegions = new Set(template.quality.comparableRegions);
  const userRegions = new Set(user.quality.comparableRegions);
  const comparableRegions = allRegions.filter(
    (region) => templateRegions.has(region) && userRegions.has(region),
  );
  const unavailableRegions = Object.fromEntries(
    allRegions.filter((region) => !comparableRegions.includes(region)).map((region) => [
      region,
      unavailableReason(region, template, user),
    ]),
  ) as Partial<Record<BodyRegion, string>>;

  if (
    comparableRegions.length < 4 ||
    requiredRegions.some((region) => !comparableRegions.includes(region))
  ) {
    throw new ComparisonRejected(
      'INSUFFICIENT_COMPARABLE_REGIONS',
      'at least four regions including lower body, shooting arm, and timing are required',
      { comparableRegions, unavailableRegions },
    );
  }
  return {
    shootingHand: template.capture.shootingHand,
    templateView: template.capture.detectedView,
    userView: user.capture.detectedView,
    comparableRegions,
    unavailableRegions,
  };
}
