import { useState } from 'react';

import type { BodyRegion, ReportBundle, ReportFrame, TimelineSample } from '@shot-ai/contracts';

import { projectNormalizedPoint, type ReportViewFit, type ViewTransform } from './fit-to-view.ts';
import { regionIsAvailable } from './regions.ts';
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
          <DifferenceLinks
            frame={frame}
            sample={sample}
            shootingHand={report.template.shootingHand}
            templateTransform={templateTransform}
            userTransform={userTransform}
          />
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

function DifferenceLinks({
  frame,
  sample,
  shootingHand,
  templateTransform,
  userTransform,
}: {
  frame: ReportFrame;
  sample: TimelineSample;
  shootingHand: ReportBundle['template']['shootingHand'];
  templateTransform: ViewTransform;
  userTransform: ViewTransform;
}) {
  const template = new Map(frame.templateNormalizedSkeleton.map((point) => [point.name, point]));
  const user = new Map(frame.userNormalizedSkeleton.map((point) => [point.name, point]));
  const names = regionLandmarks(shootingHand);
  const links: React.ReactNode[] = [];
  for (const [region, pointNames] of Object.entries(names) as Array<[BodyRegion, string[]]>) {
    const difference = sample.differences[region];
    if (!difference.highlighted || !regionIsAvailable(difference)) continue;
    for (const name of pointNames) {
      const templatePoint = template.get(name);
      const userPoint = user.get(name);
      if (!templatePoint || !userPoint) continue;
      const templatePosition = projectNormalizedPoint(templatePoint, templateTransform);
      const userPosition = projectNormalizedPoint(userPoint, userTransform);
      links.push(
        <line
          key={`${region}-${name}`}
          className="difference-link"
          x1={templatePosition.x}
          y1={templatePosition.y}
          x2={userPosition.x}
          y2={userPosition.y}
          data-highlighted-region={region}
        />,
      );
    }
  }
  return <g aria-hidden="true">{links}</g>;
}

function regionLandmarks(shootingHand: ReportBundle['template']['shootingHand']): Partial<Record<BodyRegion, string[]>> {
  const guideHand = shootingHand === 'right' ? 'left' : 'right';
  return {
    lower_body: ['left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
    torso: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
    shooting_arm: [`${shootingHand}_elbow`, `${shootingHand}_wrist`],
    guide_arm: [`${guideHand}_elbow`, `${guideHand}_wrist`],
  };
}

export { CourtGrid };
