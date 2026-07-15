import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReportBundle, ReportFrame, TimelineSample } from '@shot-ai/contracts';

import type { PlaybackRate, PlaybackState } from './playback.ts';
import { needsVideoCorrection } from './playback.ts';
import { SkeletonLayer } from './Skeleton.tsx';

interface SideBySideRendererProps {
  report: ReportBundle;
  frame: ReportFrame;
  sample: TimelineSample;
  state: PlaybackState;
  effectiveRate: PlaybackRate;
  onMasterSample: (sampleIndex: number) => void;
}

interface FrameVideo {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export function SideBySideRenderer({
  report,
  frame,
  sample,
  state,
  effectiveRate,
  onMasterSample,
}: SideBySideRendererProps) {
  const templateRef = useRef<HTMLVideoElement>(null);
  const userRef = useRef<HTMLVideoElement>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const fps = report.comparison.previews.fps;

  const playBoth = useCallback(async () => {
    const template = templateRef.current;
    const user = userRef.current;
    if (!template || !user) return;
    template.playbackRate = effectiveRate;
    user.playbackRate = effectiveRate;
    try {
      await Promise.all([template.play(), user.play()]);
    } catch {
      // Muted local previews normally autoplay after the explicit play action.
      // If the browser still blocks them, the shared state remains available
      // and a second user play action can resume without losing the sample.
    }
  }, [effectiveRate]);

  useEffect(() => {
    const template = templateRef.current;
    const user = userRef.current;
    if (!template || !user) return;
    const targetTime = state.sampleIndex / fps;
    template.playbackRate = effectiveRate;
    user.playbackRate = effectiveRate;
    if (!state.playing) {
      template.pause();
      user.pause();
      if (Math.abs(template.currentTime - targetTime) > 0.015) template.currentTime = targetTime;
      if (Math.abs(user.currentTime - targetTime) > 0.015) user.currentTime = targetTime;
      return;
    }
    if (Math.abs(user.currentTime - targetTime) > 0.08) user.currentTime = targetTime;
    if (Math.abs(template.currentTime - targetTime) > 0.08) template.currentTime = targetTime;
    if (user.paused || template.paused) void playBoth();
  }, [effectiveRate, fps, playBoth, state.playing, state.sampleIndex]);

  useEffect(() => {
    if (!state.playing) return;
    const user = userRef.current;
    const template = templateRef.current;
    if (!user || !template) return;
    const frameApi = user as unknown as FrameVideo;
    const requestFrame = frameApi.requestVideoFrameCallback;
    const cancelFrame = frameApi.cancelVideoFrameCallback;
    let cancelled = false;
    let callbackId = 0;

    const sync = () => {
      if (cancelled) return;
      if (user.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || template.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setBuffering(true);
        user.pause();
        template.pause();
      } else {
        setBuffering(false);
        if (needsVideoCorrection(user.currentTime, template.currentTime)) {
          template.currentTime = user.currentTime;
        }
        onMasterSample(Math.round(user.currentTime * fps));
      }
      if (requestFrame) callbackId = requestFrame.call(user, sync);
      else callbackId = window.requestAnimationFrame(sync);
    };

    if (requestFrame) callbackId = requestFrame.call(user, sync);
    else callbackId = window.requestAnimationFrame(sync);
    return () => {
      cancelled = true;
      if (cancelFrame && requestFrame) {
        cancelFrame.call(user, callbackId);
      } else {
        window.cancelAnimationFrame(callbackId);
      }
    };
  }, [fps, onMasterSample, state.playing]);

  const handleWaiting = () => {
    setBuffering(true);
    templateRef.current?.pause();
    userRef.current?.pause();
  };
  const handleCanPlay = () => {
    const template = templateRef.current;
    const user = userRef.current;
    if (!template || !user) return;
    if (template.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && user.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      setBuffering(false);
      if (state.playing) void playBoth();
    }
  };

  return (
    <section className="renderer side-by-side-renderer" aria-label="并排视频对比">
      <div className="renderer-toolbar">
        <div><span className="eyebrow">MODE 01</span><strong>同步原画 / 单一时间轴</strong></div>
        <label className="compact-toggle">
          <input type="checkbox" checked={showSkeleton} onChange={(event) => setShowSkeleton(event.target.checked)} />
          <span>显示骨架</span>
        </label>
      </div>
      <div className="video-pair">
        <VideoPane
          label="模板"
          tone="template"
          videoRef={templateRef}
          videoUrl={report.template.previewVideoUrl}
          skeleton={frame.templateVideoSkeleton}
          showSkeleton={showSkeleton}
          shootingHand={report.template.shootingHand}
          differences={sample.differences}
          onWaiting={handleWaiting}
          onCanPlay={handleCanPlay}
        />
        <VideoPane
          label="你的动作"
          tone="user"
          videoRef={userRef}
          videoUrl={report.user.previewVideoUrl}
          skeleton={frame.userVideoSkeleton}
          showSkeleton={showSkeleton}
          shootingHand={report.template.shootingHand}
          differences={sample.differences}
          onWaiting={handleWaiting}
          onCanPlay={handleCanPlay}
        />
      </div>
      {buffering ? <p className="buffering-signal" role="status">一侧视频正在缓冲，两侧已同步暂停</p> : null}
    </section>
  );
}

function VideoPane({
  label,
  tone,
  videoRef,
  videoUrl,
  skeleton,
  showSkeleton,
  shootingHand,
  differences,
  onWaiting,
  onCanPlay,
}: {
  label: string;
  tone: 'template' | 'user';
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  skeleton: ReportFrame['templateVideoSkeleton'];
  showSkeleton: boolean;
  shootingHand: ReportBundle['template']['shootingHand'];
  differences: TimelineSample['differences'];
  onWaiting: () => void;
  onCanPlay: () => void;
}) {
  const [aspectRatio, setAspectRatio] = useState('9 / 16');
  return (
    <article className={`video-pane pane-${tone}`}>
      <header><span>{tone === 'template' ? 'TEMPLATE' : 'USER'}</span><strong>{label}</strong></header>
      <div className="video-stage" style={{ aspectRatio }}>
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          onWaiting={onWaiting}
          onCanPlay={onCanPlay}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth > 0 && video.videoHeight > 0) setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
            onCanPlay();
          }}
        />
        {showSkeleton ? (
          <svg className="video-skeleton" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            <SkeletonLayer
              points={skeleton}
              coordinateSpace="video"
              variant={tone}
              shootingHand={shootingHand}
              differences={differences}
            />
          </svg>
        ) : null}
      </div>
    </article>
  );
}
