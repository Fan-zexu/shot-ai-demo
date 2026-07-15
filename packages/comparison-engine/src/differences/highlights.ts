import {
  BodyRegions,
  type BodyRegion,
  type TimelineSample,
} from '@shot-ai/contracts';

import type { ComparisonThresholds } from '../types.ts';

const allRegions = BodyRegions as readonly BodyRegion[];

function exceedsThreshold(sample: TimelineSample, region: BodyRegion, thresholds: ComparisonThresholds) {
  const difference = sample.differences[region];
  return (
    difference.comparable &&
    difference.confidence >= thresholds.minRegionConfidence &&
    ((difference.angleDeltaDeg !== null &&
      difference.angleDeltaDeg >= thresholds.angleDeltaDeg) ||
      (difference.positionDelta !== null &&
        difference.positionDelta >= thresholds.positionDelta) ||
      (difference.phaseDelta !== null &&
        Math.abs(difference.phaseDelta) >= thresholds.phaseDelta))
  );
}

export function applyHighlightPersistence(
  timeline: TimelineSample[],
  thresholds: ComparisonThresholds,
): TimelineSample[] {
  const highlighted = new Map<BodyRegion, Set<number>>(
    allRegions.map((region) => [region, new Set<number>()]),
  );
  for (const region of allRegions) {
    let runStart = -1;
    for (let index = 0; index <= timeline.length; index += 1) {
      const active =
        index < timeline.length && exceedsThreshold(timeline[index]!, region, thresholds);
      if (active && runStart < 0) runStart = index;
      if (!active && runStart >= 0) {
        if (index - runStart >= thresholds.highlightPersistenceFrames) {
          for (let cursor = runStart; cursor < index; cursor += 1) {
            highlighted.get(region)!.add(cursor);
          }
        }
        runStart = -1;
      }
    }
  }
  return timeline.map((sample, sampleIndex) => ({
    ...sample,
    differences: Object.fromEntries(
      allRegions.map((region) => [
        region,
        {
          ...sample.differences[region],
          highlighted: highlighted.get(region)!.has(sampleIndex),
        },
      ]),
    ) as TimelineSample['differences'],
  }));
}
