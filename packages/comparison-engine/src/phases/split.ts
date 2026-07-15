import {
  MotionEventNames,
  type MotionArtifact,
  type MotionEventName,
  type MotionFrame,
} from '@shot-ai/contracts';

import { ComparisonRejected, type PhaseFrames } from '../types.ts';

const eventNames = MotionEventNames as readonly MotionEventName[];
const phaseEvents = eventNames.slice(0, -1).map((startEvent, index) => ({
  startEvent,
  endEvent: eventNames[index + 1]!,
})) as Array<{ startEvent: MotionEventName; endEvent: MotionEventName }>;

function framesBetween(
  artifact: MotionArtifact,
  startEvent: MotionEventName,
  endEvent: MotionEventName,
): MotionFrame[] {
  const start = artifact.events[startEvent].frameIndex;
  const end = artifact.events[endEvent].frameIndex;
  const frames = artifact.frames.filter(
    (frame) => frame.frameIndex >= start && frame.frameIndex <= end,
  );
  if (
    frames.length < 2 ||
    frames[0]?.frameIndex !== start ||
    frames.at(-1)?.frameIndex !== end
  ) {
    throw new ComparisonRejected(
      'INVALID_EVENTS',
      'every phase must include both event anchor frames',
      { artifactId: artifact.artifactId, startEvent, endEvent, start, end },
    );
  }
  return frames;
}

export function splitPhases(
  template: MotionArtifact,
  user: MotionArtifact,
): PhaseFrames[] {
  return phaseEvents.map(({ startEvent, endEvent }, index) => ({
    index,
    startEvent,
    endEvent,
    templateFrames: framesBetween(template, startEvent, endEvent),
    userFrames: framesBetween(user, startEvent, endEvent),
  }));
}

export function normalizedFrameProgress(frames: MotionFrame[], index: number) {
  if (frames.length <= 1) return 0;
  const start = frames[0]!.frameIndex;
  const end = frames.at(-1)!.frameIndex;
  if (end === start) return index / (frames.length - 1);
  return (frames[index]!.frameIndex - start) / (end - start);
}
