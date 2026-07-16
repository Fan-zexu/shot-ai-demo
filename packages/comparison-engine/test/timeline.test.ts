import assert from 'node:assert/strict';
import test from 'node:test';

import { Value } from '@sinclair/typebox/value';
import {
  ComparisonResultSchema,
  MotionEventNames,
  type MotionEventName,
} from '@shot-ai/contracts';

import { compareMotions, ComparisonRejected } from '../src/index.ts';
import { makeArtifact } from './fixtures.ts';

test('five phase-local alignments produce one schema-valid common render timeline', () => {
  const template = makeArtifact({ sourceType: 'template' });
  const user = makeArtifact({ sourceType: 'user' });

  const result = compareMotions({
    comparisonId: 'cmp_test',
    template,
    user,
    templatePreviewFileId: 'file_template_preview',
    userPreviewFileId: 'file_user_preview',
    resultId: 'result_test',
    createdAt: '2026-07-15T12:00:00.000Z',
  });

  assert.equal(Value.Check(ComparisonResultSchema, result), true);
  assert.equal(result.phases.length, 5);
  assert.equal(result.displayTimeline?.length, result.previews.frameCount);
  assert.equal(result.previews.durationMs, (result.previews.frameCount * 1000) / 30);
  assert.equal(result.renderTimeline[0]!.progress, 0);
  assert.equal(result.renderTimeline.at(-1)!.progress, 1);
  for (let index = 1; index < result.renderTimeline.length; index += 1) {
    const previous = result.renderTimeline[index - 1]!;
    const current = result.renderTimeline[index]!;
    assert.ok(current.templateFrameIndex >= previous.templateFrameIndex);
    assert.ok(current.userFrameIndex >= previous.userFrameIndex);
  }

  const eventNames = MotionEventNames as readonly MotionEventName[];
  result.phases.forEach((phase, index) => {
    const start = result.renderTimeline[phase.startSampleIndex]!;
    const end = result.renderTimeline[phase.endSampleIndex]!;
    assert.equal(start.templateFrameIndex, template.events[eventNames[index]!].frameIndex);
    assert.equal(start.userFrameIndex, user.events[eventNames[index]!].frameIndex);
    assert.equal(end.templateFrameIndex, template.events[eventNames[index + 1]!].frameIndex);
    assert.equal(end.userFrameIndex, user.events[eventNames[index + 1]!].frameIndex);
    if (index > 0) assert.equal(phase.startSampleIndex, result.phases[index - 1]!.endSampleIndex);
  });
});

for (const fps of [30, 60, 120]) {
  test(`${fps} FPS input keeps a two-second display clock instead of stretching DTW samples`, () => {
    const frameCount = fps * 2;
    const lastFrame = frameCount - 1;
    const eventFrames = [
      0,
      Math.round(lastFrame * 0.2),
      Math.round(lastFrame * 0.4),
      Math.round(lastFrame * 0.6),
      Math.round(lastFrame * 0.8),
      lastFrame,
    ] as [number, number, number, number, number, number];
    const template = makeArtifact({ sourceType: 'template', frameCount, eventFrames, nominalFps: fps });
    const user = makeArtifact({ sourceType: 'user', frameCount, eventFrames, nominalFps: fps });

    const result = compareMotions({
      comparisonId: `cmp_${fps}fps`,
      template,
      user,
      templatePreviewFileId: 'file_template_preview',
      userPreviewFileId: 'file_user_preview',
    });

    assert.equal(result.previews.durationMs, 2_000);
    assert.equal(result.previews.frameCount, 60);
    assert.equal(result.displayTimeline?.length, 60);
    assert.equal(result.displayTimeline?.[0]?.alignmentSampleIndex, 0);
    assert.equal(result.displayTimeline?.at(-1)?.alignmentSampleIndex, result.renderTimeline.length - 1);
  });
}

test('120 FPS report characteristics keep the alignment path but display near source time', () => {
  const template = makeArtifact({
    sourceType: 'template',
    frameCount: 248,
    eventFrames: [94, 121, 149, 176, 204, 231],
    nominalFps: 120,
    normalSpeedConfirmed: false,
  });
  const user = makeArtifact({
    sourceType: 'user',
    frameCount: 264,
    eventFrames: [113, 139, 166, 192, 219, 245],
    nominalFps: 120,
    normalSpeedConfirmed: false,
  });

  const result = compareMotions({
    comparisonId: 'cmp_50e_characteristic',
    template,
    user,
    templatePreviewFileId: 'file_template_preview',
    userPreviewFileId: 'file_user_preview',
  });

  assert.ok(result.renderTimeline.length > result.previews.frameCount);
  assert.ok(result.previews.durationMs >= 1_100);
  assert.ok(result.previews.durationMs <= 1_200);
});

test('an altered-speed template removes timestamp velocity from alignment', () => {
  const template = makeArtifact({
    sourceType: 'template',
    frameCount: 11,
    eventFrames: [0, 2, 4, 6, 8, 10],
    normalSpeedConfirmed: false,
  });
  const user = makeArtifact({
    sourceType: 'user',
    frameCount: 81,
    eventFrames: [0, 16, 32, 48, 64, 80],
  });

  const result = compareMotions({
    comparisonId: 'cmp_altered_speed_template',
    template,
    user,
    templatePreviewFileId: 'file_template_preview',
    userPreviewFileId: 'file_user_preview',
  });

  assert.equal(result.provenance.thresholdSnapshot.velocityWeight, 0);
});

test('large phase-length mismatch remains rejected when both speeds are trusted', () => {
  const template = makeArtifact({
    sourceType: 'template',
    frameCount: 11,
    eventFrames: [0, 2, 4, 6, 8, 10],
    normalSpeedConfirmed: true,
  });
  const user = makeArtifact({
    sourceType: 'user',
    frameCount: 81,
    eventFrames: [0, 16, 32, 48, 64, 80],
  });

  assert.throws(
    () =>
      compareMotions({
        comparisonId: 'cmp_trusted_speed_mismatch',
        template,
        user,
        templatePreviewFileId: 'file_template_preview',
        userPreviewFileId: 'file_user_preview',
      }),
    (error: unknown) =>
      error instanceof ComparisonRejected && error.code === 'LOW_ALIGNMENT_CONFIDENCE',
  );
});

test('all modes can trace a highlighted region to numeric difference and confidence evidence', () => {
  const template = makeArtifact({ sourceType: 'template' });
  const user = makeArtifact({ sourceType: 'user', shootingAngleOffset: 18 });
  const result = compareMotions({
    comparisonId: 'cmp_difference',
    template,
    user,
    templatePreviewFileId: 'file_template_preview',
    userPreviewFileId: 'file_user_preview',
  });

  const highlighted = result.renderTimeline.filter(
    (sample) => sample.differences.shooting_arm.highlighted,
  );
  assert.ok(highlighted.length >= 3);
  assert.ok(
    highlighted.every(
      (sample) =>
        sample.differences.shooting_arm.angleDeltaDeg !== null &&
        sample.differences.shooting_arm.angleDeltaDeg >= 10 &&
        sample.differences.shooting_arm.confidence >= 0.6,
    ),
  );
  assert.ok(result.deviationWindows.some((window) => window.region === 'shooting_arm'));
});

test('an optional unavailable region degrades consistently across the whole timeline', () => {
  const template = makeArtifact({ sourceType: 'template' });
  const user = makeArtifact({
    sourceType: 'user',
    comparableRegions: ['lower_body', 'torso', 'shooting_arm', 'whole_body_timing'],
  });
  const result = compareMotions({
    comparisonId: 'cmp_degraded',
    template,
    user,
    templatePreviewFileId: 'file_template_preview',
    userPreviewFileId: 'file_user_preview',
  });

  assert.equal(result.compatibility.unavailableRegions.guide_arm, 'fixture region unavailable');
  assert.ok(
    result.renderTimeline.every(
      (sample) =>
        sample.differences.guide_arm.comparable === false &&
        sample.differences.guide_arm.confidence === 0 &&
        sample.differences.guide_arm.highlighted === false,
    ),
  );
});

test('declared regions without common frame features are rejected as low-confidence alignment', () => {
  const template = makeArtifact({ sourceType: 'template' });
  const user = makeArtifact({ sourceType: 'user' });
  for (const artifact of [template, user]) {
    artifact.frames = artifact.frames.map((frame) => ({
      ...frame,
      normalizedLandmarks: [],
      retargetedLandmarks: [],
      jointAnglesDeg: {},
    }));
  }

  assert.throws(
    () =>
      compareMotions({
        comparisonId: 'cmp_no_features',
        template,
        user,
        templatePreviewFileId: 'file_template_preview',
        userPreviewFileId: 'file_user_preview',
      }),
    (error: unknown) =>
      error instanceof ComparisonRejected && error.code === 'LOW_ALIGNMENT_CONFIDENCE',
  );
});
