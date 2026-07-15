import {
  BodyRegions,
  type BodyRegion,
  type MotionFrame,
  type RegionDifferences,
  type ShootingHand,
} from '@shot-ai/contracts';

import type { ComparisonThresholds } from '../types.ts';
import { regionAngleNames, regionLandmarkNames } from '../features/regions.ts';
import { normalizedFrameProgress } from '../phases/split.ts';

const allRegions = BodyRegions as readonly BodyRegion[];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function maxOrNull(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function regionProgress(
  frames: MotionFrame[],
  region: BodyRegion,
  shootingHand: ShootingHand,
) {
  if (region === 'whole_body_timing') {
    return frames.map((_, index) => normalizedFrameProgress(frames, index));
  }
  const names = new Set(regionLandmarkNames(region, shootingHand));
  const cumulative = [0];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = new Map(
      frames[index - 1]!.retargetedLandmarks.map((point) => [point.name, point]),
    );
    const current = new Map(
      frames[index]!.retargetedLandmarks.map((point) => [point.name, point]),
    );
    const movements: number[] = [];
    for (const name of names) {
      const before = previous.get(name);
      const after = current.get(name);
      if (!before || !after) continue;
      movements.push(Math.hypot(after.x - before.x, after.y - before.y));
    }
    const step = movements.length
      ? movements.reduce((sum, value) => sum + value, 0) / movements.length
      : 0;
    cumulative.push(cumulative[index - 1]! + step);
  }
  const total = cumulative.at(-1)!;
  if (total <= 1e-9) {
    return frames.map((_, index) => normalizedFrameProgress(frames, index));
  }
  return cumulative.map((value) => value / total);
}

function angleDelta(
  template: MotionFrame,
  user: MotionFrame,
  region: BodyRegion,
  shootingHand: ShootingHand,
) {
  return maxOrNull(
    regionAngleNames(region, shootingHand).flatMap((name) => {
      const templateValue = template.jointAnglesDeg[name];
      const userValue = user.jointAnglesDeg[name];
      return templateValue === null ||
        templateValue === undefined ||
        userValue === null ||
        userValue === undefined
        ? []
        : [Math.abs(templateValue - userValue)];
    }),
  );
}

function positionDelta(
  template: MotionFrame,
  user: MotionFrame,
  region: BodyRegion,
  shootingHand: ShootingHand,
) {
  const templatePoints = new Map(
    template.retargetedLandmarks.map((point) => [point.name, point]),
  );
  const userPoints = new Map(user.retargetedLandmarks.map((point) => [point.name, point]));
  const values = regionLandmarkNames(region, shootingHand).flatMap((name) => {
    const first = templatePoints.get(name);
    const second = userPoints.get(name);
    if (!first || !second) return [];
    const confidence = Math.min(first.confidence, second.confidence);
    return [
      {
        value: Math.hypot(first.x - second.x, first.y - second.y),
        confidence,
      },
    ];
  });
  const totalConfidence = values.reduce((sum, item) => sum + item.confidence, 0);
  if (totalConfidence <= 1e-9) return null;
  return (
    values.reduce((sum, item) => sum + item.value * item.confidence, 0) /
    totalConfidence
  );
}

interface DifferenceInput {
  templateFrame: MotionFrame;
  userFrame: MotionFrame;
  templateFrames: MotionFrame[];
  userFrames: MotionFrame[];
  templateIndex: number;
  userIndex: number;
  shootingHand: ShootingHand;
  comparableRegions: BodyRegion[];
  alignmentConfidence: number;
  thresholds: ComparisonThresholds;
}

export function calculateRegionDifferences(input: DifferenceInput) {
  const differences = {} as RegionDifferences;
  const exceeded = {} as Record<BodyRegion, boolean>;
  for (const region of allRegions) {
    const available = input.comparableRegions.includes(region);
    const angle = available
      ? angleDelta(input.templateFrame, input.userFrame, region, input.shootingHand)
      : null;
    const position = available
      ? positionDelta(input.templateFrame, input.userFrame, region, input.shootingHand)
      : null;
    const hasTiming = available;
    const templateProgress = hasTiming
      ? regionProgress(input.templateFrames, region, input.shootingHand)[input.templateIndex]!
      : null;
    const userProgress = hasTiming
      ? regionProgress(input.userFrames, region, input.shootingHand)[input.userIndex]!
      : null;
    const phaseDelta =
      templateProgress === null || userProgress === null
        ? null
        : clamp(userProgress - templateProgress, -1, 1);
    const confidence = available
      ? clamp(
          Math.min(
            input.templateFrame.regionConfidence[region],
            input.userFrame.regionConfidence[region],
            input.alignmentConfidence,
          ),
          0,
          1,
        )
      : 0;
    const comparable = available && (angle !== null || position !== null || phaseDelta !== null);
    const thresholdReached =
      (angle !== null && angle >= input.thresholds.angleDeltaDeg) ||
      (position !== null && position >= input.thresholds.positionDelta) ||
      (phaseDelta !== null && Math.abs(phaseDelta) >= input.thresholds.phaseDelta);
    exceeded[region] =
      comparable && confidence >= input.thresholds.minRegionConfidence && thresholdReached;
    differences[region] = {
      angleDeltaDeg: angle,
      positionDelta: position,
      templatePhaseProgress: templateProgress,
      userPhaseProgress: userProgress,
      phaseDelta,
      confidence,
      comparable,
      highlighted: false,
    };
  }
  return { differences, exceeded };
}
