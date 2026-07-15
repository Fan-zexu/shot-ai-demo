import assert from 'node:assert/strict';
import test from 'node:test';

import { weightedFeatureCost, type FrameFeatures } from '../src/index.ts';

const empty = (): FrameFeatures => ({ angles: {}, positions: {}, velocities: {} });

test('missing feature groups are removed and remaining weights are renormalized', () => {
  const template = empty();
  const user = empty();
  template.angles.elbow = { value: 90, confidence: 0.9 };
  template.positions.wrist = { x: 0, y: 0, confidence: 0.8 };
  user.positions.wrist = { x: 0.2, y: 0, confidence: 0.8 };

  const result = weightedFeatureCost(template, user, {
    angle: 0.5,
    position: 0.3,
    velocity: 0.2,
  });

  assert.ok(Math.abs(result.cost - 0.2) < 1e-12);
  assert.equal(result.coverage, 1);
  assert.equal(result.confidence, 0.8);
});

test('no common dimensions returns zero coverage instead of fake zero-valued features', () => {
  const template = empty();
  const user = empty();
  template.angles.elbow = { value: 90, confidence: 0.9 };
  user.angles.knee = { value: 90, confidence: 0.9 };

  const result = weightedFeatureCost(template, user, {
    angle: 0.5,
    position: 0.3,
    velocity: 0.2,
  });

  assert.deepEqual(result, { cost: 1, coverage: 0, confidence: 0 });
});
