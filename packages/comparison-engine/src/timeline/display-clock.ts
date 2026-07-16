import type { DisplayTimelineSample, TimelineSample } from '@shot-ai/contracts';

const DISPLAY_FPS = 30;

export function buildDisplayTimeline(
  alignmentTimeline: TimelineSample[],
): DisplayTimelineSample[] {
  if (alignmentTimeline.length === 0) return [];
  const templateDurationMs = sourceDurationMs(alignmentTimeline, 'templateTimestampMs');
  const userDurationMs = sourceDurationMs(alignmentTimeline, 'userTimestampMs');
  const durationMs = (templateDurationMs + userDurationMs) / 2;
  const frameCount = Math.max(1, Math.round(durationMs * DISPLAY_FPS / 1000));
  const positions = normalizedSourcePositions(alignmentTimeline);
  let alignmentCursor = 0;

  return Array.from({ length: frameCount }, (_, displayFrameIndex) => {
    const target = frameCount === 1 ? 0 : displayFrameIndex / (frameCount - 1);
    while (
      alignmentCursor < positions.length - 1 &&
      Math.abs(positions[alignmentCursor + 1]! - target) <=
        Math.abs(positions[alignmentCursor]! - target)
    ) {
      alignmentCursor += 1;
    }
    return {
      displayFrameIndex,
      displayTimestampMs: displayFrameIndex * 1000 / DISPLAY_FPS,
      alignmentSampleIndex: alignmentCursor,
    };
  });
}

function sourceDurationMs(
  timeline: TimelineSample[],
  key: 'templateTimestampMs' | 'userTimestampMs',
) {
  if (timeline.length === 1) return 1000 / DISPLAY_FPS;
  const first = timeline[0]![key];
  const last = timeline.at(-1)![key];
  return Math.max(1000 / DISPLAY_FPS, last - first + medianPositiveDelta(timeline, key));
}

function medianPositiveDelta(
  timeline: TimelineSample[],
  key: 'templateTimestampMs' | 'userTimestampMs',
) {
  const deltas: number[] = [];
  for (let index = 1; index < timeline.length; index += 1) {
    const delta = timeline[index]![key] - timeline[index - 1]![key];
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 1000 / DISPLAY_FPS;
  deltas.sort((left, right) => left - right);
  const middle = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0
    ? (deltas[middle - 1]! + deltas[middle]!) / 2
    : deltas[middle]!;
}

function normalizedSourcePositions(timeline: TimelineSample[]) {
  const first = timeline[0]!;
  const last = timeline.at(-1)!;
  const templateSpan = Math.max(1, last.templateTimestampMs - first.templateTimestampMs);
  const userSpan = Math.max(1, last.userTimestampMs - first.userTimestampMs);
  return timeline.map((sample) => (
    (sample.templateTimestampMs - first.templateTimestampMs) / templateSpan +
    (sample.userTimestampMs - first.userTimestampMs) / userSpan
  ) / 2);
}
