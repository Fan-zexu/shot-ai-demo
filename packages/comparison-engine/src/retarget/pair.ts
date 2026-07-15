import type {
  MotionArtifact,
  MotionFrame,
  NormalizedLandmark2D,
} from '@shot-ai/contracts';

interface Segment {
  name: string;
  parent: string;
  child: string;
}

const limbSegments: Segment[] = [
  { name: 'left_thigh', parent: 'left_hip', child: 'left_knee' },
  { name: 'left_shin', parent: 'left_knee', child: 'left_ankle' },
  { name: 'right_thigh', parent: 'right_hip', child: 'right_knee' },
  { name: 'right_shin', parent: 'right_knee', child: 'right_ankle' },
  { name: 'left_upper_arm', parent: 'left_shoulder', child: 'left_elbow' },
  { name: 'left_forearm', parent: 'left_elbow', child: 'left_wrist' },
  { name: 'right_upper_arm', parent: 'right_shoulder', child: 'right_elbow' },
  { name: 'right_forearm', parent: 'right_elbow', child: 'right_wrist' },
];

const allSegments: Segment[] = [
  { name: 'hip_width', parent: 'left_hip', child: 'right_hip' },
  { name: 'shoulder_width', parent: 'left_shoulder', child: 'right_shoulder' },
  ...limbSegments,
];

const distance = (first: { x: number; y: number }, second: { x: number; y: number }) =>
  Math.hypot(first.x - second.x, first.y - second.y);

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function center(
  points: Map<string, NormalizedLandmark2D>,
  first: string,
  second: string,
) {
  const a = points.get(first);
  const b = points.get(second);
  if (!a || !b) return undefined;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    confidence: Math.min(a.confidence, b.confidence),
  };
}

function stableLengths(artifact: MotionArtifact) {
  const samples = new Map<string, number[]>();
  for (const segment of allSegments) samples.set(segment.name, []);
  samples.set('torso', []);
  for (const frame of artifact.frames) {
    const points = new Map(frame.normalizedLandmarks.map((point) => [point.name, point]));
    for (const segment of allSegments) {
      const parent = points.get(segment.parent);
      const child = points.get(segment.child);
      if (parent && child) samples.get(segment.name)!.push(distance(parent, child));
    }
    const hips = center(points, 'left_hip', 'right_hip');
    const shoulders = center(points, 'left_shoulder', 'right_shoulder');
    if (hips && shoulders) samples.get('torso')!.push(distance(hips, shoulders));
  }
  const result: Record<string, number> = {};
  for (const [name, values] of samples) {
    const declared = artifact.canonicalSkeleton.segmentLengths[name];
    if (declared && declared > 0) result[name] = declared;
    else if (values.length) result[name] = median(values);
  }
  return result;
}

function unitDirection(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fallback: { x: number; y: number },
) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length <= 1e-9) return fallback;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

function placePairAroundCenter(
  points: Map<string, NormalizedLandmark2D>,
  firstName: string,
  secondName: string,
  pairCenter: { x: number; y: number },
  targetLength: number | undefined,
) {
  const first = points.get(firstName);
  const second = points.get(secondName);
  if (!first || !second || !targetLength) return;
  const direction = unitDirection(first, second, { x: 1, y: 0 });
  const half = targetLength / 2;
  points.set(firstName, {
    ...first,
    x: pairCenter.x - direction.x * half,
    y: pairCenter.y - direction.y * half,
  });
  points.set(secondName, {
    ...second,
    x: pairCenter.x + direction.x * half,
    y: pairCenter.y + direction.y * half,
  });
}

function retargetFrame(frame: MotionFrame, target: Record<string, number>): MotionFrame {
  const original = new Map(frame.normalizedLandmarks.map((point) => [point.name, point]));
  const retargeted = new Map(
    frame.normalizedLandmarks.map((point) => [point.name, { ...point }]),
  );
  const originalHips = center(original, 'left_hip', 'right_hip');
  if (!originalHips) return { ...frame, retargetedLandmarks: [...retargeted.values()] };

  placePairAroundCenter(
    retargeted,
    'left_hip',
    'right_hip',
    originalHips,
    target.hip_width,
  );
  const originalShoulders = center(original, 'left_shoulder', 'right_shoulder');
  if (originalShoulders) {
    const torsoDirection = unitDirection(originalHips, originalShoulders, { x: 0, y: -1 });
    const torsoLength = target.torso ?? distance(originalHips, originalShoulders);
    const shoulderCenter = {
      x: originalHips.x + torsoDirection.x * torsoLength,
      y: originalHips.y + torsoDirection.y * torsoLength,
    };
    placePairAroundCenter(
      retargeted,
      'left_shoulder',
      'right_shoulder',
      shoulderCenter,
      target.shoulder_width,
    );
  }

  for (const segment of limbSegments) {
    const originalParent = original.get(segment.parent);
    const originalChild = original.get(segment.child);
    const targetParent = retargeted.get(segment.parent);
    if (!originalParent || !originalChild || !targetParent || !target[segment.name]) continue;
    const direction = unitDirection(originalParent, originalChild, { x: 0, y: 1 });
    const child = retargeted.get(segment.child) ?? originalChild;
    retargeted.set(segment.child, {
      ...child,
      x: targetParent.x + direction.x * target[segment.name]!,
      y: targetParent.y + direction.y * target[segment.name]!,
    });
  }
  return { ...frame, retargetedLandmarks: [...retargeted.values()] };
}

export function retargetPair(template: MotionArtifact, user: MotionArtifact) {
  const templateLengths = stableLengths(template);
  const userLengths = stableLengths(user);
  const names = new Set([...Object.keys(templateLengths), ...Object.keys(userLengths)]);
  const segmentLengths: Record<string, number> = {};
  for (const name of names) {
    const first = templateLengths[name];
    const second = userLengths[name];
    if (first && second) segmentLengths[name] = (first + second) / 2;
    else segmentLengths[name] = first ?? second!;
  }
  const apply = (artifact: MotionArtifact): MotionArtifact => ({
    ...artifact,
    frames: artifact.frames.map((frame) => retargetFrame(frame, segmentLengths)),
    canonicalSkeleton: {
      ...artifact.canonicalSkeleton,
      segmentLengths,
    },
  });
  return {
    template: apply(template),
    user: apply(user),
    segmentLengths,
  };
}
