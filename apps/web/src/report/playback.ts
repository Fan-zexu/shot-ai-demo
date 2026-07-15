import { useEffect, useMemo, useReducer } from 'react';

import type { ComparisonResult, MotionEventName, PlaybackMode } from '@shot-ai/contracts';

export type PlaybackRate = 0.25 | 0.5 | 1;

export interface PlaybackState {
  mode: PlaybackMode;
  playing: boolean;
  progress: number;
  sampleIndex: number;
  playbackRate: PlaybackRate;
  selectedEvent: MotionEventName | null;
  autoSlowSuppressed: boolean;
}

export type PlaybackAction =
  | { type: 'set_mode'; mode: PlaybackMode }
  | { type: 'play'; totalSamples: number }
  | { type: 'pause' }
  | { type: 'seek'; sampleIndex: number; totalSamples: number }
  | { type: 'jump_event'; event: MotionEventName; sampleIndex: number; totalSamples: number }
  | { type: 'set_rate'; rate: PlaybackRate }
  | { type: 'advance'; totalSamples: number }
  | { type: 'master_sample'; sampleIndex: number; totalSamples: number };

export function initialPlaybackState(): PlaybackState {
  return {
    mode: 'side_by_side',
    playing: false,
    progress: 0,
    sampleIndex: 0,
    playbackRate: 1,
    selectedEvent: 'prep_start',
    autoSlowSuppressed: false,
  };
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'set_mode':
      return { ...state, mode: action.mode };
    case 'play': {
      const restart = state.sampleIndex >= action.totalSamples - 1;
      return {
        ...atSample(state, restart ? 0 : state.sampleIndex, action.totalSamples),
        playing: true,
        selectedEvent: restart ? 'prep_start' : null,
        autoSlowSuppressed: restart ? false : state.autoSlowSuppressed,
      };
    }
    case 'pause':
      return { ...state, playing: false, autoSlowSuppressed: true };
    case 'seek':
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples),
        playing: false,
        selectedEvent: null,
        autoSlowSuppressed: true,
      };
    case 'jump_event':
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples),
        playing: false,
        selectedEvent: action.event,
        autoSlowSuppressed: true,
      };
    case 'set_rate':
      return { ...state, playbackRate: action.rate, autoSlowSuppressed: true };
    case 'advance': {
      const nextSample = Math.min(action.totalSamples - 1, state.sampleIndex + 1);
      return {
        ...atSample(state, nextSample, action.totalSamples),
        playing: nextSample < action.totalSamples - 1,
        selectedEvent: null,
      };
    }
    case 'master_sample':
      return {
        ...atSample(state, action.sampleIndex, action.totalSamples),
        playing: state.playing && action.sampleIndex < action.totalSamples - 1,
        selectedEvent: null,
      };
  }
}

export function usePlayback(result: ComparisonResult) {
  const totalSamples = result.renderTimeline.length;
  const [state, dispatch] = useReducer(playbackReducer, undefined, initialPlaybackState);
  const inDifferenceWindow = useMemo(
    () => result.deviationWindows.some(
      (window) => state.sampleIndex >= window.startSampleIndex && state.sampleIndex <= window.endSampleIndex,
    ),
    [result.deviationWindows, state.sampleIndex],
  );
  const autoSlowed =
    state.mode === 'skeleton_overlay' &&
    state.playing &&
    inDifferenceWindow &&
    !state.autoSlowSuppressed &&
    state.playbackRate > 0.5;
  const effectiveRate: PlaybackRate = autoSlowed ? 0.5 : state.playbackRate;

  useEffect(() => {
    if (!state.playing || state.mode === 'side_by_side') return;
    const interval = window.setInterval(
      () => dispatch({ type: 'advance', totalSamples }),
      1000 / (result.previews.fps * effectiveRate),
    );
    return () => window.clearInterval(interval);
  }, [effectiveRate, result.previews.fps, state.mode, state.playing, totalSamples]);

  return { state, dispatch, totalSamples, effectiveRate, autoSlowed };
}

function atSample(state: PlaybackState, sampleIndex: number, totalSamples: number) {
  const maximum = Math.max(0, totalSamples - 1);
  const bounded = Math.min(maximum, Math.max(0, Math.round(sampleIndex)));
  return {
    ...state,
    sampleIndex: bounded,
    progress: maximum === 0 ? 0 : bounded / maximum,
  };
}

export function needsVideoCorrection(masterTime: number, followerTime: number) {
  // Compare in milliseconds with a tiny floating-point tolerance so exactly
  // 40 ms remains inside the documented synchronization boundary.
  return Math.abs(masterTime - followerTime) * 1000 > 40.000_001;
}
