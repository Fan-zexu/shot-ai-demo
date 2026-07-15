import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkCompatibility,
  ComparisonRejected,
} from '../src/index.ts';
import { makeArtifact } from './fixtures.ts';

function rejectsWith(code: ComparisonRejected['code']) {
  return (error: unknown) => error instanceof ComparisonRejected && error.code === code;
}

test('same-hand compatibility is mandatory', () => {
  const template = makeArtifact({ sourceType: 'template', shootingHand: 'right' });
  const user = makeArtifact({ sourceType: 'user', shootingHand: 'left' });

  assert.throws(() => checkCompatibility(template, user), rejectsWith('HAND_MISMATCH'));
});

test('both artifacts must use the shooting-hand side view', () => {
  const template = makeArtifact({ sourceType: 'template' });
  const user = makeArtifact({ sourceType: 'user', view: 'oblique' });

  assert.throws(() => checkCompatibility(template, user), rejectsWith('VIEW_MISMATCH'));
});

test('four common regions and all mandatory regions are required', () => {
  const template = makeArtifact({ sourceType: 'template' });
  const user = makeArtifact({
    sourceType: 'user',
    comparableRegions: ['lower_body', 'torso', 'guide_arm', 'whole_body_timing'],
  });

  assert.throws(
    () => checkCompatibility(template, user),
    rejectsWith('INSUFFICIENT_COMPARABLE_REGIONS'),
  );
});

test('event anchors must be strictly ordered and reference real analyzed frames', () => {
  const template = makeArtifact({ sourceType: 'template' });
  const user = makeArtifact({ sourceType: 'user' });
  user.events.shooting_arm_lift.frameIndex = 16;

  assert.throws(() => checkCompatibility(template, user), rejectsWith('INVALID_EVENTS'));
});
