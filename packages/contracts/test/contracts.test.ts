import assert from 'node:assert/strict';
import test from 'node:test';

import { Value } from '@sinclair/typebox/value';

import {
  ComparisonResultSchema,
  MotionArtifactSchema,
  QualityReportSchema,
} from '../src/index.ts';
import {
  acceptedMotionArtifact,
  comparisonResult,
  rejectedQualityReport,
} from './fixtures.ts';

test('accepted motion artifacts contain six ordered events', () => {
  assert.equal(Value.Check(MotionArtifactSchema, acceptedMotionArtifact), true);
  assert.deepEqual(Object.keys(acceptedMotionArtifact.events), [
    'prep_start',
    'body_lowest',
    'lower_body_extension_start',
    'shooting_arm_lift',
    'release_pose_proxy',
    'follow_through_end',
  ]);
  assert.equal(acceptedMotionArtifact.events.release_pose_proxy.isProxy, true);
});

test('rejected quality reports validate without a motion artifact', () => {
  assert.equal(Value.Check(QualityReportSchema, rejectedQualityReport), true);
});

test('comparison result owns the shared render timeline', () => {
  assert.equal(Value.Check(ComparisonResultSchema, comparisonResult), true);
  assert.equal(comparisonResult.previews.frameCount, comparisonResult.renderTimeline.length);
});

test('closed schemas reject unknown fields', () => {
  assert.equal(
    Value.Check(MotionArtifactSchema, { ...acceptedMotionArtifact, unexpected: true }),
    false,
  );
});

test('release pose proxy cannot claim a real release event', () => {
  const invalid = structuredClone(acceptedMotionArtifact) as unknown as {
    events: { release_pose_proxy: { isProxy: boolean } };
  };
  invalid.events.release_pose_proxy.isProxy = false;
  assert.equal(Value.Check(MotionArtifactSchema, invalid), false);
});
