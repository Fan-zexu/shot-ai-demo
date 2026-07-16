import assert from 'node:assert/strict';
import test from 'node:test';

import type { MotionArtifact, QualityCheck } from '@shot-ai/contracts';
import { acceptedMotionArtifact } from '@shot-ai/contracts/fixtures';

import { assessPresentationCompatibility } from '../src/report/presentation-compatibility.ts';

test('clean side-view full-body captures allow reliable overlay modes', () => {
  const template = artifactWithChecks(passChecks());
  const user = artifactWithChecks(passChecks());

  assert.deepEqual(assessPresentationCompatibility(template, user), {
    level: 'reliable',
    reasons: [],
    modes: { sideBySide: 'enabled', skeletonOverlay: 'enabled', motionChannel: 'enabled' },
  });
});

test('camera movement keeps overlay modes available but explicitly reference-only', () => {
  const template = artifactWithChecks([
    ...passChecks(),
    check('CAMERA_STABILITY', 'warning', 0.081),
  ]);
  const user = artifactWithChecks(passChecks());
  const result = assessPresentationCompatibility(template, user);

  assert.equal(result.level, 'reference_only');
  assert.deepEqual(result.modes, {
    sideBySide: 'enabled',
    skeletonOverlay: 'reference_only',
    motionChannel: 'reference_only',
  });
  assert.deepEqual(result.reasons, ['template_camera_unstable']);
});

test('wrong view or severe framing disables precision-looking modes but preserves side-by-side', () => {
  const template = artifactWithChecks(passChecks());
  const user = artifactWithChecks([
    check('SIDE_VIEW', 'warning', 'front'),
    check('REQUIRED_LANDMARK_COVERAGE', 'warning', 0.65),
    check('MAX_CONSECUTIVE_MISSING_FRAMES', 'pass', 0),
    check('POSE_CONFIDENCE', 'pass', 0.9),
  ]);
  const result = assessPresentationCompatibility(template, user);

  assert.equal(result.level, 'side_by_side_only');
  assert.equal(result.modes.sideBySide, 'enabled');
  assert.equal(result.modes.skeletonOverlay, 'disabled');
  assert.equal(result.modes.motionChannel, 'disabled');
  assert.deepEqual(result.reasons, ['user_view_mismatch', 'user_body_out_of_frame']);
});

function artifactWithChecks(checks: QualityCheck[]): MotionArtifact {
  const artifact = structuredClone(acceptedMotionArtifact);
  artifact.quality.checks = checks;
  return artifact;
}

function passChecks(): QualityCheck[] {
  return [
    check('SIDE_VIEW', 'pass', 'shooting_side'),
    check('REQUIRED_LANDMARK_COVERAGE', 'pass', 1),
    check('MAX_CONSECUTIVE_MISSING_FRAMES', 'pass', 0),
    check('POSE_CONFIDENCE', 'pass', 0.9),
  ];
}

function check(code: string, status: QualityCheck['status'], measuredValue: number | string): QualityCheck {
  return { code, status, measuredValue, message: code };
}
