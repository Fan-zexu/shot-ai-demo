import type {
  Landmark2D,
  NormalizedLandmark2D,
  ReportBundle,
  ReportFrame,
} from '@shot-ai/contracts';

import { eventSampleIndices } from './events.ts';
import { displayTimelineFor } from './playback.ts';
import { CORE_DISPLAY_LANDMARKS } from './Skeleton.tsx';

const PRESENTATION_CONFIDENCE_FLOOR = 0.35;
const coreLandmarks = new Set<string>(CORE_DISPLAY_LANDMARKS);

export interface JointJumpDiagnostic {
  landmark: string;
  distance: number;
  fromDisplayFrame: number;
  toDisplayFrame: number;
}

export interface PlaybackDiagnostics {
  alignmentTransitions: number;
  templateRepeatedMappings: number;
  templateRepeatedPercent: number;
  userRepeatedMappings: number;
  userRepeatedPercent: number;
  templatePeakJump: JointJumpDiagnostic;
  userPeakJump: JointJumpDiagnostic;
}

export function playbackDiagnostics(report: ReportBundle): PlaybackDiagnostics {
  const timeline = report.comparison.renderTimeline;
  const alignmentTransitions = Math.max(0, timeline.length - 1);
  const templateRepeatedMappings = repeatedMappings(timeline, 'templateFrameIndex');
  const userRepeatedMappings = repeatedMappings(timeline, 'userFrameIndex');
  const displayFrames = displayTimelineFor(report.comparison).map((displaySample) => (
    report.renderFrames[displaySample.alignmentSampleIndex]!
  ));

  return {
    alignmentTransitions,
    templateRepeatedMappings,
    templateRepeatedPercent: percentage(templateRepeatedMappings, alignmentTransitions),
    userRepeatedMappings,
    userRepeatedPercent: percentage(userRepeatedMappings, alignmentTransitions),
    templatePeakJump: peakJump(displayFrames, 'templateNormalizedSkeleton'),
    userPeakJump: peakJump(displayFrames, 'userNormalizedSkeleton'),
  };
}

export function buildPresentationSequence(report: ReportBundle): ReportFrame[] {
  const anchorSamples = new Set(Object.values(eventSampleIndices(report.comparison)));
  const rawFrames = displayTimelineFor(report.comparison).map((displaySample) => (
    report.renderFrames[displaySample.alignmentSampleIndex]!
  ));

  return rawFrames.reduce<ReportFrame[]>((sequence, rawFrame, index) => {
    const previous = sequence[index - 1];
    if (!previous || anchorSamples.has(rawFrame.sampleIndex)) {
      sequence.push(cloneFrame(rawFrame));
      return sequence;
    }
    sequence.push(smoothFrame(previous, rawFrame));
    return sequence;
  }, []);
}

export function interpolateReportFrames(start: ReportFrame, end: ReportFrame, progress: number): ReportFrame {
  const amount = clamp(progress, 0, 1);
  return {
    sampleIndex: amount < 0.5 ? start.sampleIndex : end.sampleIndex,
    templateVideoSkeleton: interpolateVideoLandmarks(start.templateVideoSkeleton, end.templateVideoSkeleton, amount),
    userVideoSkeleton: interpolateVideoLandmarks(start.userVideoSkeleton, end.userVideoSkeleton, amount),
    templateNormalizedSkeleton: interpolateNormalizedLandmarks(
      start.templateNormalizedSkeleton,
      end.templateNormalizedSkeleton,
      amount,
    ),
    userNormalizedSkeleton: interpolateNormalizedLandmarks(
      start.userNormalizedSkeleton,
      end.userNormalizedSkeleton,
      amount,
    ),
  };
}

function repeatedMappings(
  timeline: ReportBundle['comparison']['renderTimeline'],
  field: 'templateFrameIndex' | 'userFrameIndex',
) {
  let count = 0;
  for (let index = 1; index < timeline.length; index += 1) {
    if (timeline[index]![field] === timeline[index - 1]![field]) count += 1;
  }
  return count;
}

function percentage(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function peakJump(
  frames: ReportFrame[],
  field: 'templateNormalizedSkeleton' | 'userNormalizedSkeleton',
): JointJumpDiagnostic {
  let peak: JointJumpDiagnostic = {
    landmark: '—',
    distance: 0,
    fromDisplayFrame: 0,
    toDisplayFrame: 0,
  };
  for (let index = 1; index < frames.length; index += 1) {
    const previous = new Map(frames[index - 1]![field].map((point) => [point.name, point]));
    for (const point of frames[index]![field]) {
      if (!coreLandmarks.has(point.name)) continue;
      const from = previous.get(point.name);
      if (!from || Math.min(from.confidence, point.confidence) < PRESENTATION_CONFIDENCE_FLOOR) continue;
      const distance = Math.hypot(point.x - from.x, point.y - from.y);
      if (distance > peak.distance) {
        peak = {
          landmark: point.name,
          distance,
          fromDisplayFrame: index - 1,
          toDisplayFrame: index,
        };
      }
    }
  }
  return peak;
}

function smoothFrame(previous: ReportFrame, raw: ReportFrame): ReportFrame {
  return {
    sampleIndex: raw.sampleIndex,
    templateVideoSkeleton: smoothVideoLandmarks(previous.templateVideoSkeleton, raw.templateVideoSkeleton),
    userVideoSkeleton: smoothVideoLandmarks(previous.userVideoSkeleton, raw.userVideoSkeleton),
    templateNormalizedSkeleton: smoothNormalizedLandmarks(
      previous.templateNormalizedSkeleton,
      raw.templateNormalizedSkeleton,
    ),
    userNormalizedSkeleton: smoothNormalizedLandmarks(previous.userNormalizedSkeleton, raw.userNormalizedSkeleton),
  };
}

function smoothVideoLandmarks(previous: Landmark2D[], raw: Landmark2D[]): Landmark2D[] {
  const previousByName = new Map(previous.map((point) => [point.name, point]));
  return raw.map((point) => {
    const from = previousByName.get(point.name);
    const sharedConfidence = from ? Math.min(confidence(from), confidence(point)) : 0;
    if (!from || sharedConfidence < PRESENTATION_CONFIDENCE_FLOOR) return { ...point };
    const amount = smoothingAmount(sharedConfidence);
    const smoothed: Landmark2D = {
      ...point,
      x: lerp(from.x, point.x, amount),
      y: lerp(from.y, point.y, amount),
    };
    if (point.z !== undefined) {
      smoothed.z = from.z === undefined ? point.z : lerp(from.z, point.z, amount);
    }
    return smoothed;
  });
}

function smoothNormalizedLandmarks(previous: NormalizedLandmark2D[], raw: NormalizedLandmark2D[]) {
  const previousByName = new Map(previous.map((point) => [point.name, point]));
  return raw.map((point) => {
    const from = previousByName.get(point.name);
    const sharedConfidence = from ? Math.min(from.confidence, point.confidence) : 0;
    if (!from || sharedConfidence < PRESENTATION_CONFIDENCE_FLOOR) return { ...point };
    const amount = smoothingAmount(sharedConfidence);
    return {
      ...point,
      x: lerp(from.x, point.x, amount),
      y: lerp(from.y, point.y, amount),
    };
  });
}

function interpolateVideoLandmarks(start: Landmark2D[], end: Landmark2D[], amount: number): Landmark2D[] {
  const startByName = new Map(start.map((point) => [point.name, point]));
  return end.map((point) => {
    const from = startByName.get(point.name);
    if (!from) return { ...point };
    const interpolated: Landmark2D = {
      ...point,
      x: lerp(from.x, point.x, amount),
      y: lerp(from.y, point.y, amount),
      visibility: lerp(from.visibility, point.visibility, amount),
      presence: lerp(from.presence, point.presence, amount),
    };
    if (point.z !== undefined) {
      interpolated.z = from.z === undefined ? point.z : lerp(from.z, point.z, amount);
    }
    return interpolated;
  });
}

function interpolateNormalizedLandmarks(
  start: NormalizedLandmark2D[],
  end: NormalizedLandmark2D[],
  amount: number,
) {
  const startByName = new Map(start.map((point) => [point.name, point]));
  return end.map((point) => {
    const from = startByName.get(point.name);
    if (!from) return { ...point };
    return {
      ...point,
      x: lerp(from.x, point.x, amount),
      y: lerp(from.y, point.y, amount),
      confidence: lerp(from.confidence, point.confidence, amount),
    };
  });
}

function cloneFrame(frame: ReportFrame): ReportFrame {
  return {
    sampleIndex: frame.sampleIndex,
    templateVideoSkeleton: frame.templateVideoSkeleton.map((point) => ({ ...point })),
    userVideoSkeleton: frame.userVideoSkeleton.map((point) => ({ ...point })),
    templateNormalizedSkeleton: frame.templateNormalizedSkeleton.map((point) => ({ ...point })),
    userNormalizedSkeleton: frame.userNormalizedSkeleton.map((point) => ({ ...point })),
  };
}

function confidence(point: Landmark2D) {
  return Math.min(point.visibility, point.presence);
}

function smoothingAmount(sharedConfidence: number) {
  // Low-confidence but still visible points follow the previous display copy
  // more strongly; high-confidence points stay responsive with less lag.
  return 0.35 + clamp(sharedConfidence, 0, 1) * 0.35;
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
