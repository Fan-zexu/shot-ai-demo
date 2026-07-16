import { useCallback, useEffect, useState } from 'react';

import type { ReportBundle } from '@shot-ai/contracts';

import { AppShell } from '../components/AppShell.tsx';
import { getReport, toApiError } from '../lib/api.ts';
import type { PublicApiError } from '../lib/types.ts';
import { DebugPanel } from '../report/DebugPanel.tsx';
import { ModeSwitcher, PlaybackControls } from '../report/PlaybackControls.tsx';
import { MotionChannelRenderer } from '../report/MotionChannelRenderer.tsx';
import { usePlayback } from '../report/playback.ts';
import { RegionEvidence } from '../report/RegionEvidence.tsx';
import { SideBySideRenderer } from '../report/SideBySideRenderer.tsx';
import { SkeletonOverlayRenderer } from '../report/SkeletonOverlayRenderer.tsx';

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
  const { state, dispatch, totalSamples, displayTimeline, effectiveRate } = usePlayback(report.comparison);
  const sample = report.comparison.renderTimeline[state.sampleIndex]!;
  const frame = report.renderFrames[state.sampleIndex]!;
  const onMasterFrame = useCallback(
    (displayFrameIndex: number) => {
      const bounded = Math.min(displayTimeline.length - 1, Math.max(0, displayFrameIndex));
      dispatch({
        type: 'master_sample',
        displayFrameIndex: bounded,
        sampleIndex: displayTimeline[bounded]!.alignmentSampleIndex,
        totalSamples,
      });
    },
    [dispatch, displayTimeline, totalSamples],
  );

  return (
    <AppShell active="report">
      <article
        className="report-workspace"
        data-mode={state.mode}
        data-sample-index={state.sampleIndex}
        data-playing={state.playing}
      >
        <header className="report-header">
          <div>
            <span className="eyebrow">COMPARISON REPORT / 不评分</span>
            <h1>动作对比报告</h1>
            <p>参考：{report.template.name} · {report.template.shootingHand === 'right' ? '右手投篮' : '左手投篮'}</p>
          </div>
          <dl>
            <div><dt>同步采样</dt><dd>{report.renderFrames.length}</dd></div>
            <div><dt>差异窗口</dt><dd>{report.comparison.deviationWindows.length}</dd></div>
            <div><dt>可比较区域</dt><dd>{report.comparison.compatibility.comparableRegions.length} / 5</dd></div>
          </dl>
        </header>

        <ModeSwitcher state={state} dispatch={dispatch} />

        {state.mode === 'side_by_side' ? (
          <SideBySideRenderer
            report={report}
            frame={frame}
            sample={sample}
            state={state}
            effectiveRate={effectiveRate}
            onMasterFrame={onMasterFrame}
            showAllLandmarks={showAllLandmarks}
          />
        ) : null}
        {state.mode === 'skeleton_overlay' ? (
          <SkeletonOverlayRenderer
            report={report}
            frame={frame}
            sample={sample}
            showAllLandmarks={showAllLandmarks}
          />
        ) : null}
        {state.mode === 'motion_channel' ? (
          <MotionChannelRenderer
            report={report}
            frame={frame}
            sample={sample}
            showAllLandmarks={showAllLandmarks}
          />
        ) : null}

        <PlaybackControls result={report.comparison} state={state} dispatch={dispatch} />
        <RegionEvidence differences={sample.differences} />
        <DebugPanel
          report={report}
          frame={frame}
          sample={sample}
          showAllLandmarks={showAllLandmarks}
          onShowAllLandmarksChange={setShowAllLandmarks}
        />
      </article>
    </AppShell>
  );
}
