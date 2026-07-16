import type { Dispatch } from 'react';

import type { ComparisonResult, MotionEventName, PlaybackMode } from '@shot-ai/contracts';

import { eventSampleIndices, phaseLabel, REPORT_EVENTS } from './events.ts';
import {
  displayFrameForSample,
  displayTimelineFor,
  type PlaybackAction,
  type PlaybackRate,
  type PlaybackState,
} from './playback.ts';

const MODE_OPTIONS: Array<{ mode: PlaybackMode; label: string; index: string }> = [
  { mode: 'side_by_side', label: '并排视频', index: '01' },
  { mode: 'skeleton_overlay', label: '骨架叠加', index: '02' },
  { mode: 'motion_channel', label: '动作通道', index: '03' },
];

export function ModeSwitcher({ state, dispatch }: { state: PlaybackState; dispatch: Dispatch<PlaybackAction> }) {
  return (
    <div className="mode-switcher" role="group" aria-label="报告呈现模式">
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          aria-pressed={state.mode === option.mode}
          className={state.mode === option.mode ? 'is-active' : ''}
          onClick={() => dispatch({ type: 'set_mode', mode: option.mode })}
        >
          <span>{option.index}</span>{option.label}
        </button>
      ))}
    </div>
  );
}

export function PlaybackControls({
  result,
  state,
  dispatch,
}: {
  result: ComparisonResult;
  state: PlaybackState;
  dispatch: Dispatch<PlaybackAction>;
}) {
  const totalSamples = result.renderTimeline.length;
  const current = result.renderTimeline[state.sampleIndex]!;
  const eventSamples = eventSampleIndices(result);
  const displayTimeline = displayTimelineFor(result);

  return (
    <section className="playback-console" aria-label="统一播放控制">
      <div className="playback-main-row">
        <button
          className="play-button"
          type="button"
          aria-label={state.playing ? '暂停动作' : '播放动作'}
          onClick={() => {
            if (state.playing) dispatch({ type: 'pause' });
            else dispatch({ type: 'play', totalSamples });
          }}
        >
          <span aria-hidden="true">{state.playing ? 'Ⅱ' : '▶'}</span>
        </button>
        <div className="timeline-control">
          <div className="timeline-meta">
            <strong>{phaseLabel(result, current.phaseIndex)}</strong>
            <span>SAMPLE {String(state.sampleIndex + 1).padStart(3, '0')} / {String(totalSamples).padStart(3, '0')}</span>
          </div>
          <div className="range-wrap">
            <input
              type="range"
              aria-label="动作阶段进度"
              min={0}
              max={Math.max(0, totalSamples - 1)}
              step={1}
              value={state.sampleIndex}
              onChange={(event) => dispatch({
                type: 'seek',
                sampleIndex: Number(event.target.value),
                displayFrameIndex: displayFrameForSample(displayTimeline, Number(event.target.value)),
                totalSamples,
              })}
            />
            <div className="event-ticks" aria-hidden="true">
              {REPORT_EVENTS.map((event) => (
                <i
                  key={event.name}
                  style={{ left: `${(eventSamples[event.name] / Math.max(1, totalSamples - 1)) * 100}%` }}
                />
              ))}
            </div>
          </div>
          <div className="frame-map">
            <span>TEMPLATE F{current.templateFrameIndex}</span>
            <span>USER F{current.userFrameIndex}</span>
          </div>
        </div>
      </div>

      <div className="event-jumps" aria-label="六个关键事件">
        {REPORT_EVENTS.map((event, index) => (
          <button
            key={event.name}
            type="button"
            aria-pressed={state.selectedEvent === event.name}
            onClick={() => dispatch({
              type: 'jump_event',
              event: event.name,
              sampleIndex: eventSamples[event.name],
              displayFrameIndex: displayFrameForSample(displayTimeline, eventSamples[event.name]),
              totalSamples,
            })}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{event.label}</strong>
            {event.name === 'release_pose_proxy' ? <small>非真实离手检测</small> : null}
          </button>
        ))}
      </div>

      <div className="rate-control">
        <span>
          <strong>{result.displayTimeline ? '阶段同步播放' : '旧版对齐播放'}</strong>
          <small>
            {result.displayTimeline
              ? `源时间戳显示时钟 · ${(result.previews.durationMs / 1000).toFixed(2)} 秒`
              : '固定 30 FPS 旧时间轴，时长不代表原片'}
          </small>
        </span>
        {([0.25, 0.5, 1] as PlaybackRate[]).map((rate) => (
          <button
            key={rate}
            type="button"
            aria-pressed={state.playbackRate === rate}
            onClick={() => dispatch({ type: 'set_rate', rate })}
            aria-label={rate === 1 ? '标准对齐速度' : rate === 0.5 ? '二分之一慢放' : '四分之一慢放'}
          >
            {rate === 1 ? '标准' : `${rate}×`}
          </button>
        ))}
      </div>
    </section>
  );
}
