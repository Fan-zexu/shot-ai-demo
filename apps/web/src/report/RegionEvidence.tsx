import type { RegionDifferences } from '@shot-ai/contracts';

import { REGION_LABELS, REGION_ORDER, regionIsAvailable } from './regions.ts';

export function RegionEvidence({ differences }: { differences: RegionDifferences }) {
  return (
    <section className="region-evidence" aria-label="当前身体区域差异">
      <div className="evidence-heading">
        <div><span className="eyebrow">REGION OBSERVATION</span><h2>当前区域观察</h2></div>
        <p>这里只指出是否触发模板差异高亮，不代表动作错误或训练建议。</p>
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
                <strong>{!available ? '当前不可比较' : difference.highlighted ? '与模板差异明显' : '未触发差异高亮'}</strong>
              </div>
              {!available ? <p>该区域不参与高亮，三种模式保持同一可用性结论。</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
