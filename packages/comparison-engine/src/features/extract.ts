import type {
  BodyRegion,
  MotionFrame,
  ShootingHand,
} from '@shot-ai/contracts';

import type {
  DtwFrame,
  FrameFeatures,
  ScalarFeature,
  VectorFeature,
} from '../types.ts';
import { regionAngleNames, regionLandmarkNames } from './regions.ts';

function unique(values: string[]) {
  return [...new Set(values)];
}

export function extractFrameFeatures(
  frames: MotionFrame[],
  regions: BodyRegion[],
  shootingHand: ShootingHand,
): DtwFrame[] {
  const landmarkNames = new Set(
    unique(regions.flatMap((region) => regionLandmarkNames(region, shootingHand))),
  );
  const angleNames = new Set(
    unique(regions.flatMap((region) => regionAngleNames(region, shootingHand))),
  );
  return frames.map((frame, index) => {
    const positions: Record<string, VectorFeature> = {};
    for (const point of frame.retargetedLandmarks) {
      if (!landmarkNames.has(point.name)) continue;
      positions[point.name] = {
        x: point.x,
        y: point.y,
        confidence: point.confidence,
      };
    }
    const angles: Record<string, ScalarFeature> = {};
    for (const [name, value] of Object.entries(frame.jointAnglesDeg)) {
      if (!angleNames.has(name) || value === null) continue;
      angles[name] = {
        value,
        confidence: frame.poseConfidence,
      };
    }
    const velocities: Record<string, VectorFeature> = {};
    const previous = frames[index - 1];
    if (previous) {
      const previousPoints = new Map(
        previous.retargetedLandmarks.map((point) => [point.name, point]),
      );
      const deltaSeconds = Math.max(
        (frame.timestampMs - previous.timestampMs) / 1000,
        1 / 240,
      );
      for (const [name, point] of Object.entries(positions)) {
        const prior = previousPoints.get(name);
        if (!prior) continue;
        velocities[name] = {
          x: (point.x - prior.x) / deltaSeconds,
          y: (point.y - prior.y) / deltaSeconds,
          confidence: Math.min(point.confidence, prior.confidence),
        };
      }
    }
    const features: FrameFeatures = { angles, positions, velocities };
    return { frameIndex: frame.frameIndex, features };
  });
}
