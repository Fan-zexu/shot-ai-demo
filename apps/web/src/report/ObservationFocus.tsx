import type { ComparisonResult, RegionDifferences } from '@shot-ai/contracts';

import { phaseLabel } from './events.ts';
import { REGION_LABELS, REGION_ORDER, regionIsAvailable } from './regions.ts';

export function ObservationFocus({
  result,
  phaseIndex,
  differences,
}: {
  result: ComparisonResult;
  phaseIndex: number;
  differences: RegionDifferences;
}) {
  const highlightedRegion = REGION_ORDER.find((region) => {
    const difference = differences[region];
    return difference.highlighted && regionIsAvailable(difference);
  });

  return (
    <section className="observation-focus" aria-label="当前观察重点">
      <div>
        <span>当前阶段</span>
        <strong>{phaseLabel(result, phaseIndex)}</strong>
      </div>
      <div>
        <span>优先观察</span>
        <strong>{highlightedRegion ? REGION_LABELS[highlightedRegion] : '整体动作'}</strong>
      </div>
      <p>
        {highlightedRegion
          ? '该区域在当前阶段触发了模板差异高亮，请先看动作画面。'
          : '当前阶段没有区域触发差异高亮，请先看整体动作。'}
      </p>
    </section>
  );
}
