import type {
  BodyRegion,
  ComparisonResult,
  ShootingHand,
  TimelineSample,
} from '@shot-ai/contracts';

import { calculateRegionDifferences } from '../differences/regions.ts';
import { normalizedFrameProgress } from '../phases/split.ts';
import type {
  AlignedPhase,
  ComparisonThresholds,
} from '../types.ts';

interface BuildTimelineInput {
  alignedPhases: AlignedPhase[];
  shootingHand: ShootingHand;
  comparableRegions: BodyRegion[];
  thresholds: ComparisonThresholds;
}

export function buildTimeline(input: BuildTimelineInput): {
  timeline: TimelineSample[];
  phases: ComparisonResult['phases'];
} {
  const timeline: TimelineSample[] = [];
  const phases: ComparisonResult['phases'] = [];
  for (const phase of input.alignedPhases) {
    const startSampleIndex = timeline.length === 0 ? 0 : timeline.length - 1;
    const pairs = phase.index === 0 ? phase.alignment.path : phase.alignment.path.slice(1);
    for (const pair of pairs) {
      const templateFrame = phase.templateFrames[pair.templateIndex]!;
      const userFrame = phase.userFrames[pair.userIndex]!;
      const templateProgress = normalizedFrameProgress(
        phase.templateFrames,
        pair.templateIndex,
      );
      const userProgress = normalizedFrameProgress(phase.userFrames, pair.userIndex);
      const differences = calculateRegionDifferences({
        templateFrame,
        userFrame,
        templateFrames: phase.templateFrames,
        userFrames: phase.userFrames,
        templateIndex: pair.templateIndex,
        userIndex: pair.userIndex,
        shootingHand: input.shootingHand,
        comparableRegions: input.comparableRegions,
        alignmentConfidence: pair.confidence,
        thresholds: input.thresholds,
      }).differences;
      timeline.push({
        sampleIndex: timeline.length,
        progress: 0,
        phaseIndex: phase.index,
        phaseProgress: (templateProgress + userProgress) / 2,
        templateFrameIndex: templateFrame.frameIndex,
        templateTimestampMs: templateFrame.timestampMs,
        userFrameIndex: userFrame.frameIndex,
        userTimestampMs: userFrame.timestampMs,
        differences,
      });
    }
    phases.push({
      index: phase.index,
      startEvent: phase.startEvent,
      endEvent: phase.endEvent,
      startSampleIndex,
      endSampleIndex: timeline.length - 1,
    });
  }
  const denominator = Math.max(1, timeline.length - 1);
  return {
    timeline: timeline.map((sample, index) => ({
      ...sample,
      progress: index / denominator,
    })),
    phases,
  };
}
