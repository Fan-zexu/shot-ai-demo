import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';

import type {
  ComparisonResult,
  DisplayTimelineSample,
  MotionEventName,
  PlaybackMode,
} from '@shot-ai/contracts';

export type PlaybackRate = 0.25 | 0.5 | 1;

export interface PlaybackState {
  mode: PlaybackMode;
  playing: boolean;
  progress: number;
  sampleIndex: number;
  displayFrameIndex: number;
  displayPosition: number;
  playbackRate: PlaybackRate;
  selectedEvent: MotionEventName | null;
}

export type PlaybackAction =
  | { type: 'set_mode'; mode: PlaybackMode }
  | { type: 'play'; totalSamples: number }
  | { type: 'pause' }
  | { type: 'seek'; sampleIndex: number; displayFrameIndex?: number; totalSamples: number }
  | {
      type: 'jump_event';
      event: MotionEventName;
      sampleIndex: number;
      displayFrameIndex?: number;
      totalSamples: number;
    }
  | { type: 'set_rate'; rate: PlaybackRate }
  | {
      type: 'clock_tick';
      sampleIndex: number;
      displayFrameIndex: number;
      displayPosition: number;
      totalSamples: number;
      atEnd: boolean;
    };

export function initialPlaybackState(): PlaybackState {
  return {
    mode: 'side_by_side',
    playing: false,
    progress: 0,
    sampleIndex: 0,
    displayFrameIndex: 0,
    displayPosition: 0,
    playbackRate: 1,
    selectedEvent: 'prep_start',
  };
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'set_mode':
      return { ...state, mode: action.mode };
    case 'play': {
      const restart = state.sampleIndex >= action.totalSamples - 1;
      return {
        ...atSample(
          state,
          restart ? 0 : state.sampleIndex,
          action.totalSamples,
          restart ? 0 : state.displayFrameIndex,
        ),
        displayPosition: restart ? 0 : state.displayPosition,
        playing: true,
        selectedEvent: restart ? 'prep_start' : null,
      };
    }
    case 'pause':
      return { ...state, playing: false };
    case 'seek':
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples, action.displayFrameIndex),
        playing: false,
        selectedEvent: null,
      };
    case 'jump_event':
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples, action.displayFrameIndex),
        playing: false,
        selectedEvent: action.event,
      };
    case 'set_rate':
      return { ...state, playbackRate: action.rate };
    case 'clock_tick': {
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples, action.displayFrameIndex),
        displayPosition: action.displayPosition,
        playing: state.playing && !action.atEnd,
        selectedEvent: null,
      };
    }
  }
}

export function usePlayback(result: ComparisonResult) {
  const totalSamples = result.renderTimeline.length;
  const displayTimeline = useMemo(() => displayTimelineFor(result), [result]);
  const [state, dispatch] = useReducer(playbackReducer, undefined, initialPlaybackState);
  const effectiveRate = state.playbackRate;

  useEffect(() => {
    if (!state.playing) return;
    const startPosition = state.displayPosition;
    const maximumPosition = Math.max(0, displayTimeline.length - 1);
    let startTime: number | null = null;
    let animationFrame = 0;
    const tick = (timestamp: number) => {
      startTime ??= timestamp;
      const displayPosition = Math.min(
        maximumPosition,
        displayPositionAtElapsed(startPosition, timestamp - startTime, result.previews.fps, effectiveRate),
      );
      const displayFrameIndex = Math.min(maximumPosition, Math.floor(displayPosition));
      dispatch({
        type: 'clock_tick',
        totalSamples,
        displayPosition,
        displayFrameIndex,
        sampleIndex: displayTimeline[displayFrameIndex]!.alignmentSampleIndex,
        atEnd: displayPosition >= maximumPosition,
      });
      if (displayPosition < maximumPosition) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    displayTimeline,
    effectiveRate,
    result.previews.fps,
    state.playing,
    totalSamples,
  ]);

  return { state, dispatch, totalSamples, displayTimeline, effectiveRate };
}

function atSample(
  state: PlaybackState,
  sampleIndex: number,
  totalSamples: number,
  displayFrameIndex = state.displayFrameIndex,
) {
  const maximum = Math.max(0, totalSamples - 1);
  const bounded = Math.min(maximum, Math.max(0, Math.round(sampleIndex)));
  return {
    ...state,
    sampleIndex: bounded,
    displayFrameIndex,
    displayPosition: displayFrameIndex,
    progress: maximum === 0 ? 0 : bounded / maximum,
  };
}

export function displayPositionAtElapsed(
  startPosition: number,
  elapsedMs: number,
  framesPerSecond: number,
  playbackRate: PlaybackRate,
) {
  return startPosition + (elapsedMs / 1000) * framesPerSecond * playbackRate;
}

export function useRenderFps(active: boolean, frameToken: number) {
  const [fps, setFps] = useState(0);
  const startedAt = useRef<number | null>(null);
  const committedFrames = useRef(0);

  useLayoutEffect(() => {
    if (!active) {
      startedAt.current = null;
      committedFrames.current = 0;
      setFps((current) => current === 0 ? current : 0);
      return;
    }
    const now = performance.now();
    startedAt.current ??= now;
    committedFrames.current += 1;
    const elapsed = now - startedAt.current;
    if (elapsed >= 500) {
      setFps(Math.round((committedFrames.current * 1000) / elapsed));
      startedAt.current = now;
      committedFrames.current = 0;
    }
  }, [active, frameToken]);

  return fps;
}

export function displayTimelineFor(result: ComparisonResult): DisplayTimelineSample[] {
  return result.displayTimeline ?? result.renderTimeline.map((sample) => ({
    displayFrameIndex: sample.sampleIndex,
    displayTimestampMs: sample.sampleIndex * 1000 / result.previews.fps,
    alignmentSampleIndex: sample.sampleIndex,
  }));
}

export function displayFrameForSample(
  displayTimeline: DisplayTimelineSample[],
  sampleIndex: number,
) {
  let closest = 0;
  for (let index = 1; index < displayTimeline.length; index += 1) {
    if (
      Math.abs(displayTimeline[index]!.alignmentSampleIndex - sampleIndex) <
      Math.abs(displayTimeline[closest]!.alignmentSampleIndex - sampleIndex)
    ) closest = index;
  }
  return closest;
}

export function needsVideoCorrection(masterTime: number, followerTime: number) {
  // Compare in milliseconds with a tiny floating-point tolerance so exactly
  // 40 ms remains inside the documented synchronization boundary.
  return Math.abs(masterTime - followerTime) * 1000 > 40.000_001;
}
