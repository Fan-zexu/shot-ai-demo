import assert from 'node:assert/strict';
import test from 'node:test';

import { constrainedDtw, type DtwFrame } from '../src/index.ts';

function sequence(length: number): DtwFrame[] {
  return Array.from({ length }, (_, index) => ({
    frameIndex: index,
    features: {
      angles: {
        joint: {
          value: (index / (length - 1)) * 180,
          confidence: 0.95,
        },
      },
      positions: {},
      velocities: {},
    },
  }));
}

test('constrained DTW is anchored, monotonic, band-limited, and repeat-limited', () => {
  const result = constrainedDtw({
    template: sequence(7),
    user: sequence(9),
    bandRatio: 0.15,
    maxRepeatedOutputFrames: 4,
    weights: { angle: 0.5, position: 0.3, velocity: 0.2 },
  });

  assert.deepEqual(result.path[0], {
    templateIndex: 0,
    userIndex: 0,
    localCost: 0,
    featureCoverage: 1,
    confidence: 0.95,
    atBoundary: false,
  });
  assert.equal(result.path.at(-1)!.templateIndex, 6);
  assert.equal(result.path.at(-1)!.userIndex, 8);
  for (let index = 1; index < result.path.length; index += 1) {
    const previous = result.path[index - 1]!;
    const current = result.path[index]!;
    assert.ok(current.templateIndex >= previous.templateIndex);
    assert.ok(current.userIndex >= previous.userIndex);
    assert.ok(current.templateIndex > previous.templateIndex || current.userIndex > previous.userIndex);
    assert.ok(Math.abs(current.templateIndex / 6 - current.userIndex / 8) <= 0.150000001);
  }
  for (const source of ['templateIndex', 'userIndex'] as const) {
    let run = 1;
    for (let index = 1; index < result.path.length; index += 1) {
      run = result.path[index]![source] === result.path[index - 1]![source] ? run + 1 : 1;
      assert.ok(run <= 4);
    }
  }
});

test('DTW rejects a path that would exceed the source-frame repetition limit', () => {
  assert.throws(
    () =>
      constrainedDtw({
        template: sequence(2),
        user: sequence(12),
        bandRatio: 1,
        maxRepeatedOutputFrames: 4,
        weights: { angle: 1, position: 0, velocity: 0 },
      }),
    /DTW_PATH_NOT_FOUND/,
  );
});

test('DTW keeps a connected band when one anchored phase has only two frames', () => {
  const result = constrainedDtw({
    template: sequence(2),
    user: sequence(31),
    bandRatio: 0.15,
    maxRepeatedOutputFrames: 30,
    weights: { angle: 1, position: 0, velocity: 0 },
  });

  assert.equal(result.path[0]!.templateIndex, 0);
  assert.equal(result.path[0]!.userIndex, 0);
  assert.equal(result.path.at(-1)!.templateIndex, 1);
  assert.equal(result.path.at(-1)!.userIndex, 30);
});
