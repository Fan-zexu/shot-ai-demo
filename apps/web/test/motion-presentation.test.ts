import { expect, test } from 'vitest';

import {
  buildPresentationSequence,
  interpolateReportFrames,
  playbackDiagnostics,
} from '../src/report/motion-presentation.ts';
import { reportFixture } from './report-fixture.ts';

test('playback diagnostics expose repeated source mappings and peak joint jumps', () => {
  const report = presentationFixture();
  const diagnostics = playbackDiagnostics(report);

  expect(diagnostics.alignmentTransitions).toBe(10);
  expect(diagnostics.templateRepeatedMappings).toBe(1);
  expect(diagnostics.templateRepeatedPercent).toBe(10);
  expect(diagnostics.userRepeatedMappings).toBe(0);
  expect(diagnostics.userRepeatedPercent).toBe(0);
  expect(diagnostics.userPeakJump.landmark).toBe('right_wrist');
  expect(diagnostics.userPeakJump.distance).toBeGreaterThan(1);
});

test('presentation interpolation fills the midpoint without changing either source frame', () => {
  const report = presentationFixture();
  const before = structuredClone(report.renderFrames);
  const midpoint = interpolateReportFrames(report.renderFrames[4]!, report.renderFrames[5]!, 0.5);
  const wrist = midpoint.userNormalizedSkeleton.find((point) => point.name === 'right_wrist')!;
  const start = report.renderFrames[4]!.userNormalizedSkeleton.find((point) => point.name === 'right_wrist')!;
  const end = report.renderFrames[5]!.userNormalizedSkeleton.find((point) => point.name === 'right_wrist')!;

  expect(wrist.x).toBeCloseTo((start.x + end.x) / 2);
  expect(report.renderFrames).toEqual(before);
});

test('display-only smoothing reduces a one-frame spike while preserving all event anchors', () => {
  const report = presentationFixture();
  const before = structuredClone(report);
  const sequence = buildPresentationSequence(report);
  const rawSpike = report.renderFrames[5]!.userNormalizedSkeleton.find((point) => point.name === 'right_wrist')!;
  const shownSpike = sequence[5]!.userNormalizedSkeleton.find((point) => point.name === 'right_wrist')!;

  expect(shownSpike.x).toBeLessThan(rawSpike.x);
  expect(shownSpike.x).toBeGreaterThan(
    report.renderFrames[4]!.userNormalizedSkeleton.find((point) => point.name === 'right_wrist')!.x,
  );
  for (const anchor of [0, 2, 4, 6, 8, 10]) {
    expect(sequence[anchor]).toEqual(report.renderFrames[anchor]);
  }
  expect(report).toEqual(before);
});

function presentationFixture() {
  const report = reportFixture();
  const baseTimeline = report.comparison.renderTimeline[0]!;
  const baseFrame = report.renderFrames[0]!;
  report.comparison.renderTimeline = Array.from({ length: 11 }, (_, sampleIndex) => ({
    ...structuredClone(baseTimeline),
    sampleIndex,
    progress: sampleIndex / 10,
    phaseIndex: Math.min(4, Math.floor(sampleIndex / 2)),
    phaseProgress: (sampleIndex % 2) / 2,
    templateFrameIndex: sampleIndex === 4 ? 3 : sampleIndex,
    templateTimestampMs: sampleIndex * 10,
    userFrameIndex: sampleIndex,
    userTimestampMs: sampleIndex * 10,
  }));
  report.comparison.displayTimeline = report.comparison.renderTimeline.map((sample) => ({
    displayFrameIndex: sample.sampleIndex,
    displayTimestampMs: sample.sampleIndex * (1000 / 30),
    alignmentSampleIndex: sample.sampleIndex,
  }));
  report.comparison.phases = Array.from({ length: 5 }, (_, index) => ({
    index,
    startEvent: report.comparison.phases[index]!.startEvent,
    endEvent: report.comparison.phases[index]!.endEvent,
    startSampleIndex: index * 2,
    endSampleIndex: index * 2 + 2,
  }));
  report.comparison.previews.frameCount = 11;
  report.comparison.previews.durationMs = 11 * (1000 / 30);
  report.renderFrames = Array.from({ length: 11 }, (_, sampleIndex) => {
    const frame = structuredClone(baseFrame);
    frame.sampleIndex = sampleIndex;
    if (sampleIndex === 5) {
      const wrist = frame.userNormalizedSkeleton.find((point) => point.name === 'right_wrist')!;
      wrist.x += 1.5;
    }
    return frame;
  });
  return report;
}
