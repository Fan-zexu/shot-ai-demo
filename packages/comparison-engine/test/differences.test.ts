import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BodyRegions,
  type BodyRegion,
  type RegionDifferences,
  type TimelineSample,
} from '@shot-ai/contracts';

import {
  applyHighlightPersistence,
  DEFAULT_COMPARISON_THRESHOLDS,
  mergeDeviationWindows,
} from '../src/index.ts';

const allRegions = BodyRegions as readonly BodyRegion[];

function sample(index: number, active: boolean, confidence = 0.9): TimelineSample {
  const differences = Object.fromEntries(
    allRegions.map((region) => [
      region,
      {
        angleDeltaDeg: active && region === 'shooting_arm' ? 15 : 0,
        positionDelta: 0,
        templatePhaseProgress: 0.5,
        userPhaseProgress: 0.5,
        phaseDelta: 0,
        confidence: region === 'shooting_arm' ? confidence : 0.9,
        comparable: true,
        highlighted: false,
      },
    ]),
  ) as RegionDifferences;
  return {
    sampleIndex: index,
    progress: index / 10,
    phaseIndex: 0,
    phaseProgress: index / 10,
    templateFrameIndex: index,
    templateTimestampMs: index * (1000 / 30),
    userFrameIndex: index,
    userTimestampMs: index * (1000 / 30),
    differences,
  };
}

test('highlighting requires three consecutive confident preview frames', () => {
  const timeline = [sample(0, false), sample(1, true), sample(2, true), sample(3, true), sample(4, false)];
  const result = applyHighlightPersistence(timeline, DEFAULT_COMPARISON_THRESHOLDS);

  assert.deepEqual(
    result.map((entry) => entry.differences.shooting_arm.highlighted),
    [false, true, true, true, false],
  );
});

test('low-confidence regions are never highlighted', () => {
  const timeline = [sample(0, true, 0.59), sample(1, true, 0.59), sample(2, true, 0.59)];
  const result = applyHighlightPersistence(timeline, DEFAULT_COMPARISON_THRESHOLDS);

  assert.ok(result.every((entry) => !entry.differences.shooting_arm.highlighted));
});

test('highlight windows merge when the middle gap is at most two frames', () => {
  const timeline = Array.from({ length: 7 }, (_, index) => sample(index, false));
  for (const index of [0, 1, 4, 5]) {
    timeline[index]!.differences.shooting_arm.highlighted = true;
    timeline[index]!.differences.shooting_arm.angleDeltaDeg = 12 + index;
  }

  const windows = mergeDeviationWindows(timeline, 2);

  assert.deepEqual(windows, [
    {
      region: 'shooting_arm',
      startSampleIndex: 0,
      endSampleIndex: 5,
      maxAngleDeltaDeg: 17,
      maxPositionDelta: 0,
      minConfidence: 0.9,
    },
  ]);
});
