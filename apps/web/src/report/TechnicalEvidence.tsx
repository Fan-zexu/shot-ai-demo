import type { ReportBundle, TimelineSample } from '@shot-ai/contracts';

import { REGION_LABELS, REGION_ORDER, regionIsAvailable } from './regions.ts';

export function TechnicalEvidence({
  report,
  sample,
}: {
  report: ReportBundle;
  sample: TimelineSample;
}) {
  return (
    <details className="technical-evidence">
      <summary>
        <span><b>技术证据</b> · 角度、位置、阶段与置信度</span>
        <small>默认收起</small>
      </summary>
      <div className="technical-evidence-content">
        <dl className="technical-summary-metrics">
          <div><dt>同步采样</dt><dd>{report.renderFrames.length}</dd></div>
          <div><dt>差异窗口</dt><dd>{report.comparison.deviationWindows.length}</dd></div>
          <div><dt>可比较区域</dt><dd>{report.comparison.compatibility.comparableRegions.length} / 5</dd></div>
          <div><dt>当前映射</dt><dd>TEMPLATE F{sample.templateFrameIndex} · USER F{sample.userFrameIndex}</dd></div>
        </dl>
        <div className="technical-region-grid">
          {REGION_ORDER.map((region) => {
            const difference = sample.differences[region];
            const available = regionIsAvailable(difference);
            return (
              <article key={region} className={!available ? 'is-unavailable' : ''}>
                <strong>{REGION_LABELS[region]}</strong>
                {available ? (
                  <dl>
                    <div><dt>角度差</dt><dd>{metric(difference.angleDeltaDeg, '°')}</dd></div>
                    <div><dt>位置差</dt><dd>{metric(difference.positionDelta)}</dd></div>
                    <div><dt>阶段差</dt><dd>{signedMetric(difference.phaseDelta)}</dd></div>
                    <div><dt>置信度</dt><dd>{Math.round(difference.confidence * 100)}%</dd></div>
                  </dl>
                ) : <p>当前不可比较</p>}
              </article>
            );
          })}
        </div>
        <p className="technical-boundary">这些数值只记录与当前模板的差异，不代表动作错误或训练建议。</p>
      </div>
    </details>
  );
}

function metric(value: number | null, suffix = '') {
  return value === null ? '—' : `${value.toFixed(2)}${suffix}`;
}

function signedMetric(value: number | null) {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}
