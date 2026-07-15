import type { BodyRegion, ShootingHand } from '@shot-ai/contracts';

export function oppositeHand(hand: ShootingHand): ShootingHand {
  return hand === 'right' ? 'left' : 'right';
}

export function regionLandmarkNames(
  region: BodyRegion,
  shootingHand: ShootingHand,
): string[] {
  const guideHand = oppositeHand(shootingHand);
  switch (region) {
    case 'lower_body':
      return [
        'left_hip',
        'right_hip',
        'left_knee',
        'right_knee',
        'left_ankle',
        'right_ankle',
        'left_heel',
        'right_heel',
        'left_foot_index',
        'right_foot_index',
      ];
    case 'torso':
      return ['left_hip', 'right_hip', 'left_shoulder', 'right_shoulder', 'nose'];
    case 'shooting_arm':
      return [
        `${shootingHand}_shoulder`,
        `${shootingHand}_elbow`,
        `${shootingHand}_wrist`,
      ];
    case 'guide_arm':
      return [
        `${guideHand}_shoulder`,
        `${guideHand}_elbow`,
        `${guideHand}_wrist`,
      ];
    case 'whole_body_timing':
      return [];
  }
  return [];
}

export function regionAngleNames(
  region: BodyRegion,
  shootingHand: ShootingHand,
): string[] {
  switch (region) {
    case 'lower_body':
      return ['left_knee', 'right_knee'];
    case 'shooting_arm':
      return [`${shootingHand}_elbow`];
    case 'guide_arm':
      return [`${oppositeHand(shootingHand)}_elbow`];
    case 'torso':
      return ['torso_tilt'];
    case 'whole_body_timing':
      return [];
  }
  return [];
}
