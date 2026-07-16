import type { ReportBundle, ReportFrame, TimelineSample } from '@shot-ai/contracts';

import { REGION_LABELS, REGION_ORDER, regionIsAvailable } from './regions.ts';
import { SkeletonLayer } from './Skeleton.tsx';
import { CourtGrid } from './SkeletonOverlayRenderer.tsx';

export function MotionChannelRenderer({
  report,
  frame,
  sample,
  showAllLandmarks,
}: {
  report: ReportBundle;
  frame: ReportFrame;
  sample: TimelineSample;
  showAllLandmarks: boolean;
}) {
  return (
    <section className="renderer motion-channel-renderer" aria-label="动态参考动作通道">
      <div className="renderer-toolbar">
        <div><span className="eyebrow">MODE 03</span><strong>参考动作通道 / 动态容差</strong></div>
        <span className="channel-notice">不是标准动作允许区间</span>
      </div>
      <div className="channel-layout">
        <div className="normalized-stage channel-stage">
          <svg viewBox="0 0 480 400" role="img" aria-label="用户骨架与动态参考动作通道">
            <CourtGrid />
            <SkeletonLayer
              points={frame.templateNormalizedSkeleton}
              coordinateSpace="normalized"
              variant="channel"
              shootingHand={report.template.shootingHand}
              differences={sample.differences}
              channelRadiusByRegion={report.comparison.visualization.channelRadiusByRegion}
              showAllLandmarks={showAllLandmarks}
            />
            <SkeletonLayer
              points={frame.templateNormalizedSkeleton}
              coordinateSpace="normalized"
              variant="template"
              shootingHand={report.template.shootingHand}
              differences={sample.differences}
              showAllLandmarks={showAllLandmarks}
            />
            <SkeletonLayer
              points={frame.userNormalizedSkeleton}
              coordinateSpace="normalized"
              variant="user"
              shootingHand={report.template.shootingHand}
              differences={sample.differences}
              showAllLandmarks={showAllLandmarks}
            />
          </svg>
          <span className="normalized-legend legend-template">参考通道</span>
          <span className="normalized-legend legend-user">用户动作</span>
        </div>
        <RegionTracks sample={sample} />
      </div>
      <p className="renderer-boundary">通道宽度来自可视化配置；超出只代表与当前模板差异较大，不代表生物力学错误。</p>
    </section>
  );
}

function RegionTracks({ sample }: { sample: TimelineSample }) {
  return (
    <div className="region-tracks" aria-label="身体区域阶段轨道">
      <header><span className="eyebrow">PHASE LAYERS</span><strong>区域动作错层</strong></header>
      {REGION_ORDER.map((region) => {
        const difference = sample.differences[region];
        const available = regionIsAvailable(difference) && difference.phaseDelta !== null;
        const position = available ? 50 + difference.phaseDelta! * 42 : 50;
        return (
          <div className={`region-track ${!available ? 'is-unavailable' : difference.highlighted ? 'is-highlighted' : ''}`} key={region}>
            <div><strong>{REGION_LABELS[region]}</strong><span>{available ? phaseCopy(difference.phaseDelta!) : '当前不可比较'}</span></div>
            <div className="track-line" aria-hidden="true">
              <i className="template-marker" />
              {available ? <i className="user-marker" style={{ left: `${Math.max(8, Math.min(92, position))}%` }} /> : null}
            </div>
          </div>
        );
      })}
      <div className="track-legend"><span>模板阶段</span><span>用户阶段</span></div>
    </div>
  );
}

function phaseCopy(value: number) {
  if (Math.abs(value) < 0.025) return '阶段接近';
  return value > 0 ? `相对提前 ${value.toFixed(2)}` : `相对滞后 ${Math.abs(value).toFixed(2)}`;
}
