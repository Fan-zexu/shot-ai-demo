import { useEffect, useState } from 'react';

import type { ReportBundle } from '@shot-ai/contracts';

import { AppShell } from '../components/AppShell.tsx';
import { getReport, toApiError } from '../lib/api.ts';
import type { PublicApiError } from '../lib/types.ts';

/**
 * Keeps the processing-to-report handoff functional in the upload vertical
 * slice. The interactive renderers are layered onto this same real bundle in
 * the report feature; no analysis is recomputed in the browser.
 */
export function ReportReadyPage({ comparisonId }: { comparisonId: string }) {
  const [report, setReport] = useState<ReportBundle | null>(null);
  const [error, setError] = useState<PublicApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReport(comparisonId)
      .then((bundle) => { if (!cancelled) setReport(bundle); })
      .catch((nextError) => { if (!cancelled) setError(toApiError(nextError)); });
    return () => { cancelled = true; };
  }, [comparisonId]);

  return (
    <AppShell active="report">
      <section className="report-ready">
        <span className="eyebrow">REPORT BUNDLE / 真实产物</span>
        <h1>{report ? '动作报告已就绪' : '正在读取动作报告'}</h1>
        {report ? (
          <>
            <p>同一份对齐时间轴已经生成，下一层交互只消费这份数据，不在浏览器重新计算。</p>
            <dl>
              <div><dt>参考模板</dt><dd>{report.template.name}</dd></div>
              <div><dt>投篮手</dt><dd>{report.template.shootingHand === 'right' ? '右手' : '左手'}</dd></div>
              <div><dt>同步采样</dt><dd>{report.renderFrames.length} 帧</dd></div>
              <div><dt>差异窗口</dt><dd>{report.comparison.deviationWindows.length} 个</dd></div>
            </dl>
          </>
        ) : null}
        {error ? <p className="form-request-error" role="alert">{error.message} · {error.code}</p> : null}
        <a className="button button-ghost" href="#/templates">返回模板页</a>
      </section>
    </AppShell>
  );
}
