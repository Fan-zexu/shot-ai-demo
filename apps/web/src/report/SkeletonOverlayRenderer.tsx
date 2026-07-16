import { useState } from 'react';

import type { ReportBundle, ReportFrame, TimelineSample } from '@shot-ai/contracts';

import type { ReportViewFit } from './fit-to-view.ts';
import { SkeletonLayer } from './Skeleton.tsx';

export function SkeletonOverlayRenderer({
  report,
  frame,
  sample,
  showAllLandmarks,
  viewFit,
}: {
  report: ReportBundle;
  frame: ReportFrame;
  sample: TimelineSample;
  showAllLandmarks: boolean;
  viewFit: ReportViewFit;
}) {
  const [separated, setSeparated] = useState(false);
  const templateTransform = separated ? viewFit.separated.template : viewFit.overlay;
  const userTransform = separated ? viewFit.separated.user : viewFit.overlay;

  return (
    <section className="renderer skeleton-overlay-renderer" aria-label="统一坐标骨架叠加">
      <div className="renderer-toolbar">
        <div><span className="eyebrow">MODE 02</span><strong>归一化坐标 / 排除身材与画面位置</strong></div>
        <div className="view-toggle" role="group" aria-label="骨架布局">
          <button type="button" aria-pressed={!separated} onClick={() => setSeparated(false)}>叠加</button>
          <button type="button" aria-pressed={separated} onClick={() => setSeparated(true)}>分离</button>
        </div>
      </div>
      <div className={`normalized-stage ${separated ? 'is-separated' : ''}`}>
        <svg
          viewBox="0 0 480 400"
          role="img"
          aria-label={separated ? '模板和用户归一化骨架分离显示' : '模板和用户归一化骨架叠加显示'}
          data-fit-scale={templateTransform.scale.toFixed(3)}
          data-fit-center={`${templateTransform.centerX.toFixed(3)},${templateTransform.centerY.toFixed(3)}`}
        >
          <CourtGrid />
          <SkeletonLayer
            points={frame.templateNormalizedSkeleton}
            coordinateSpace="normalized"
            variant="template"
            shootingHand={report.template.shootingHand}
            differences={sample.differences}
            centerX={templateTransform.centerX}
            centerY={templateTransform.centerY}
            scale={templateTransform.scale}
            showAllLandmarks={showAllLandmarks}
          />
          <SkeletonLayer
            points={frame.userNormalizedSkeleton}
            coordinateSpace="normalized"
            variant="user"
            shootingHand={report.template.shootingHand}
            differences={sample.differences}
            centerX={userTransform.centerX}
            centerY={userTransform.centerY}
            scale={userTransform.scale}
            showAllLandmarks={showAllLandmarks}
          />
        </svg>
        <span className="normalized-legend legend-template">模板 / 虚线</span>
        <span className="normalized-legend legend-user">用户 / 实线</span>
      </div>
      <p className="renderer-boundary">“差异较大”只表示与当前模板不同，不定义为错误动作。</p>
    </section>
  );
}

function CourtGrid() {
  return (
    <g className="court-grid" aria-hidden="true">
      {[80, 160, 240, 320, 400].map((x) => <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="400" />)}
      {[80, 160, 240, 320].map((y) => <line key={`y-${y}`} x1="0" y1={y} x2="480" y2={y} />)}
      <line className="axis" x1="240" y1="0" x2="240" y2="400" />
      <line className="ground" x1="30" y1="360" x2="450" y2="360" />
    </g>
  );
}

export { CourtGrid };
