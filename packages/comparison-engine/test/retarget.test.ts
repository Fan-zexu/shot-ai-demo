import assert from 'node:assert/strict';
import test from 'node:test';

import { retargetPair } from '../src/index.ts';
import { makeArtifact } from './fixtures.ts';

function segment(frame: ReturnType<typeof makeArtifact>['frames'][number], from: string, to: string) {
  const points = new Map(frame.retargetedLandmarks.map((point) => [point.name, point]));
  const start = points.get(from)!;
  const end = points.get(to)!;
  return { x: end.x - start.x, y: end.y - start.y, length: Math.hypot(end.x - start.x, end.y - start.y) };
}

test('pair retargeting removes segment-length differences while preserving directions', () => {
  const template = makeArtifact({ sourceType: 'template', boneScale: 0.8 });
  const user = makeArtifact({ sourceType: 'user', boneScale: 1.2 });
  const original = segment(user.frames[20]!, 'right_shoulder', 'right_elbow');

  const retargeted = retargetPair(template, user);
  const templateSegment = segment(
    retargeted.template.frames[15]!,
    'right_shoulder',
    'right_elbow',
  );
  const userSegment = segment(
    retargeted.user.frames[20]!,
    'right_shoulder',
    'right_elbow',
  );
  const dot =
    (original.x * userSegment.x + original.y * userSegment.y) /
    (original.length * userSegment.length);

  assert.ok(Math.abs(templateSegment.length - userSegment.length) < 1e-9);
  assert.ok(Math.abs(userSegment.length - retargeted.segmentLengths.right_upper_arm!) < 1e-9);
  assert.ok(dot > 0.999999);
});
