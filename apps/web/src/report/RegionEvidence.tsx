import type { RegionDifferences } from '@shot-ai/contracts';

import { REGION_LABELS, REGION_ORDER, regionIsAvailable } from './regions.ts';

export function RegionEvidence({ differences }: { differences: RegionDifferences }) {
  return (
    <section className="region-evidence" aria-label="当前身体区域差异">
      <div className="evidence-heading">
        <div><span className="eyebrow">FRAME EVIDENCE</span><h2>当前区域证据</h2></div>
        <p>仅陈述与当前模板的差异，不输出总分或动作好坏。</p>
      </div>
      <div className="region-evidence-grid">
        {REGION_ORDER.map((region) => {
          const difference = differences[region];
          const available = regionIsAvailable(difference);
          return (
            <article
              key={region}
              className={!available ? 'is-unavailable' : difference.highlighted ? 'is-highlighted' : ''}
              data-region-evidence={region}
            >
              <div>
                <span>{REGION_LABELS[region]}</span>
                <strong>{!available ? '当前不可比较' : difference.highlighted ? '差异较大' : '可比较'}</strong>
              </div>
              {available ? (
                <dl>
                  <div><dt>角度差</dt><dd>{metric(difference.angleDeltaDeg, '°')}</dd></div>
                  <div><dt>位置差</dt><dd>{metric(difference.positionDelta)}</dd></div>
                  <div><dt>阶段差</dt><dd>{signedMetric(difference.phaseDelta)}</dd></div>
                  <div><dt>置信度</dt><dd>{Math.round(difference.confidence * 100)}%</dd></div>
                </dl>
              ) : <p>该区域不参与高亮，三种模式保持同一可用性结论。</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function metric(value: number | null, suffix = '') {
  return value === null ? '—' : `${value.toFixed(2)}${suffix}`;
}

function signedMetric(value: number | null) {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}
