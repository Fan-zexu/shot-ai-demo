import { useEffect, useMemo, useState } from 'react';

import type { ReportBundle } from '@shot-ai/contracts';

import { AppShell } from '../components/AppShell.tsx';
import { getReport, toApiError } from '../lib/api.ts';
import type { PublicApiError } from '../lib/types.ts';
import { CaptureCompatibilityNotice } from '../report/CaptureCompatibilityNotice.tsx';
import { DebugPanel } from '../report/DebugPanel.tsx';
import { fitReportToView } from '../report/fit-to-view.ts';
import { ModeSwitcher, PlaybackControls } from '../report/PlaybackControls.tsx';
import { MotionChannelRenderer } from '../report/MotionChannelRenderer.tsx';
import { ObservationFocus } from '../report/ObservationFocus.tsx';
import {
  buildPresentationSequence,
  interpolateReportFrames,
  playbackDiagnostics,
} from '../report/motion-presentation.ts';
import { usePlayback, useRenderFps } from '../report/playback.ts';
import { RegionEvidence } from '../report/RegionEvidence.tsx';
import { SideBySideRenderer } from '../report/SideBySideRenderer.tsx';
import { SkeletonOverlayRenderer } from '../report/SkeletonOverlayRenderer.tsx';
import { TechnicalEvidence } from '../report/TechnicalEvidence.tsx';

export function ReportPage({ comparisonId }: { comparisonId: string }) {
  const [report, setReport] = useState<ReportBundle | null>(null);
  const [error, setError] = useState<PublicApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReport(comparisonId)
      .then((bundle) => { if (!cancelled) setReport(bundle); })
      .catch((nextError) => { if (!cancelled) setError(toApiError(nextError)); });
    return () => { cancelled = true; };
  }, [comparisonId]);

  if (error) {
    return (
      <AppShell active="report">
        <section className="report-load-state">
          <span className="eyebrow">REPORT UNAVAILABLE</span><h1>报告读取失败</h1>
          <p role="alert">{error.message} · {error.code}</p>
          <a className="button button-ghost" href="#/templates">返回模板页</a>
        </section>
      </AppShell>
    );
  }
  if (!report) {
    return (
      <AppShell active="report">
        <section className="report-load-state report-loading" aria-live="polite">
          <span className="eyebrow">LOADING SHARED TIMELINE</span><h1>读取动作报告</h1>
          <div><i /><i /><i /><i /><i /><i /></div>
          <p>正在读取同一份对齐时间轴，不会重新分析视频。</p>
        </section>
      </AppShell>
    );
  }
  return <ReportWorkspace report={report} />;
}

export function ReportWorkspace({ report }: { report: ReportBundle }) {
  const [showAllLandmarks, setShowAllLandmarks] = useState(false);
  const { state, dispatch, totalSamples, effectiveRate } = usePlayback(report.comparison);
  const sample = report.comparison.renderTimeline[state.sampleIndex]!;
  const rawFrame = report.renderFrames[state.sampleIndex]!;
  const presentationSequence = useMemo(() => buildPresentationSequence(report), [report]);
  const diagnostics = useMemo(() => playbackDiagnostics(report), [report]);
  const viewFit = useMemo(() => fitReportToView(report), [report]);
  const presentationFrame = useMemo(() => {
    if (!state.playing) return rawFrame;
    const startIndex = Math.min(presentationSequence.length - 1, Math.floor(state.displayPosition));
    const endIndex = Math.min(presentationSequence.length - 1, startIndex + 1);
    return interpolateReportFrames(
      presentationSequence[startIndex]!,
      presentationSequence[endIndex]!,
      state.displayPosition - startIndex,
    );
  }, [presentationSequence, rawFrame, state.displayPosition, state.playing]);
  const renderFps = useRenderFps(state.playing, state.displayPosition);

  return (
    <AppShell active="report">
      <article
        className="report-workspace"
        data-mode={state.mode}
        data-sample-index={state.sampleIndex}
        data-playing={state.playing}
        data-display-position={state.displayPosition.toFixed(3)}
        data-display-source={state.playing ? 'smoothed-interpolated-copy' : 'raw-analysis-frame'}
      >
        <header className="report-header">
          <div>
            <span className="eyebrow">COMPARISON REPORT / 不评分</span>
            <h1>动作对比报告</h1>
            <p>参考：{report.template.name} · {report.template.shootingHand === 'right' ? '右手投篮' : '左手投篮'}</p>
          </div>
        </header>

        <CaptureCompatibilityNotice compatibility={report.presentationCompatibility} />
        <ObservationFocus
          result={report.comparison}
          phaseIndex={sample.phaseIndex}
          differences={sample.differences}
        />
        <ModeSwitcher
          state={state}
          dispatch={dispatch}
          compatibility={report.presentationCompatibility}
        />

        {state.mode === 'side_by_side' ? (
          <SideBySideRenderer
            report={report}
            frame={presentationFrame}
            sample={sample}
            state={state}
            effectiveRate={effectiveRate}
            onPlaybackBlocked={() => dispatch({ type: 'pause' })}
            showAllLandmarks={showAllLandmarks}
          />
        ) : null}
        {state.mode === 'skeleton_overlay' ? (
          <SkeletonOverlayRenderer
            report={report}
            frame={presentationFrame}
            sample={sample}
            showAllLandmarks={showAllLandmarks}
            viewFit={viewFit}
          />
        ) : null}
        {state.mode === 'motion_channel' ? (
          <MotionChannelRenderer
            report={report}
            frame={presentationFrame}
            sample={sample}
            showAllLandmarks={showAllLandmarks}
            viewFit={viewFit}
          />
        ) : null}

        <PlaybackControls result={report.comparison} state={state} dispatch={dispatch} />
        <RegionEvidence differences={sample.differences} />
        <TechnicalEvidence report={report} sample={sample} />
        <DebugPanel
          report={report}
          frame={rawFrame}
          sample={sample}
          diagnostics={diagnostics}
          renderFps={renderFps}
          presentationActive={state.playing}
          showAllLandmarks={showAllLandmarks}
          onShowAllLandmarksChange={setShowAllLandmarks}
        />
      </article>
    </AppShell>
  );
}
