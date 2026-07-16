import { useEffect, useMemo, useReducer } from 'react';

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
  | { type: 'advance'; sampleIndex: number; displayFrameIndex: number; totalSamples: number }
  | { type: 'master_sample'; sampleIndex: number; displayFrameIndex: number; totalSamples: number };

export function initialPlaybackState(): PlaybackState {
  return {
    mode: 'side_by_side',
    playing: false,
    progress: 0,
    sampleIndex: 0,
    displayFrameIndex: 0,
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
    case 'advance': {
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples, action.displayFrameIndex),
        playing: action.sampleIndex < action.totalSamples - 1,
        selectedEvent: null,
      };
    }
    case 'master_sample':
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples, action.displayFrameIndex),
        playing: state.playing && action.sampleIndex < action.totalSamples - 1,
        selectedEvent: null,
      };
  }
}

export function usePlayback(result: ComparisonResult) {
  const totalSamples = result.renderTimeline.length;
  const displayTimeline = useMemo(() => displayTimelineFor(result), [result]);
  const [state, dispatch] = useReducer(playbackReducer, undefined, initialPlaybackState);
  const effectiveRate = state.playbackRate;

  useEffect(() => {
    if (!state.playing || state.mode === 'side_by_side') return;
    const interval = window.setInterval(
      () => {
        const displayFrameIndex = Math.min(
          displayTimeline.length - 1,
          state.displayFrameIndex + 1,
        );
        dispatch({
          type: 'advance',
          totalSamples,
          displayFrameIndex,
          sampleIndex: displayTimeline[displayFrameIndex]!.alignmentSampleIndex,
        });
      },
      1000 / (result.previews.fps * effectiveRate),
    );
    return () => window.clearInterval(interval);
  }, [
    displayTimeline,
    effectiveRate,
    result.previews.fps,
    state.displayFrameIndex,
    state.mode,
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
    progress: maximum === 0 ? 0 : bounded / maximum,
  };
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
