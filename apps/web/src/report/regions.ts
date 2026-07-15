import type { BodyRegion, RegionDifference, RegionDifferences } from '@shot-ai/contracts';

export const REGION_ORDER: BodyRegion[] = [
  'lower_body',
  'torso',
  'shooting_arm',
  'guide_arm',
  'whole_body_timing',
];

export const REGION_LABELS: Record<BodyRegion, string> = {
  lower_body: '下肢',
  torso: '躯干',
  shooting_arm: '投篮手臂',
  guide_arm: '辅助手臂',
  whole_body_timing: '全身时序',
};

export function regionIsAvailable(difference: RegionDifference) {
  return difference.comparable && difference.confidence >= 0.6;
}

export function highlightedRegions(differences: RegionDifferences) {
  return new Set(
    REGION_ORDER.filter((region) => {
      const difference = differences[region];
      return difference.highlighted && regionIsAvailable(difference);
    }),
  );
}
