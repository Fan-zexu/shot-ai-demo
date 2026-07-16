import type { NormalizedLandmark2D, ReportBundle } from '@shot-ai/contracts';

import { CORE_DISPLAY_LANDMARKS } from './Skeleton.tsx';

const VIEWBOX_WIDTH = 480;
const VIEWBOX_HEIGHT = 400;
const VISIBLE_CONFIDENCE = 0.35;
const CHANNEL_STROKE_RADIUS_FACTOR = 1.1;
const coreLandmarks = new Set<string>(CORE_DISPLAY_LANDMARKS);

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ViewTransform {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface ReportViewFit {
  overlay: ViewTransform;
  separated: {
    template: ViewTransform;
    user: ViewTransform;
  };
  safeMarginPx: number;
}

export function fitReportToView(report: ReportBundle): ReportViewFit {
  const safeMarginPx = 24;
  const templateBounds = boundsFor(
    report.renderFrames.flatMap((frame) => frame.templateNormalizedSkeleton),
  );
  const userBounds = boundsFor(
    report.renderFrames.flatMap((frame) => frame.userNormalizedSkeleton),
  );
  const combinedBounds = unionBounds(templateBounds, userBounds);
  const channelPadding = Math.max(
    ...Object.values(report.comparison.visualization.channelRadiusByRegion),
  ) * CHANNEL_STROKE_RADIUS_FACTOR;
  const overlay = fitBounds(
    inflateBounds(combinedBounds, channelPadding),
    { minX: safeMarginPx, maxX: VIEWBOX_WIDTH - safeMarginPx, minY: safeMarginPx, maxY: VIEWBOX_HEIGHT - safeMarginPx },
  );

  const halfWidth = VIEWBOX_WIDTH / 2;
  const availableHalfWidth = halfWidth - safeMarginPx * 2;
  const availableHeight = VIEWBOX_HEIGHT - safeMarginPx * 2;
  const sharedScale = Math.min(
    availableHalfWidth / width(templateBounds),
    availableHalfWidth / width(userBounds),
    availableHeight / height(combinedBounds),
  );
  const sharedCenterY = VIEWBOX_HEIGHT / 2 - midpointY(combinedBounds) * sharedScale;

  return {
    overlay,
    separated: {
      template: {
        centerX: halfWidth / 2 - midpointX(templateBounds) * sharedScale,
        centerY: sharedCenterY,
        scale: sharedScale,
      },
      user: {
        centerX: halfWidth + halfWidth / 2 - midpointX(userBounds) * sharedScale,
        centerY: sharedCenterY,
        scale: sharedScale,
      },
    },
    safeMarginPx,
  };
}

export function projectNormalizedPoint(
  point: Pick<NormalizedLandmark2D, 'x' | 'y'>,
  transform: ViewTransform,
) {
  return {
    x: transform.centerX + point.x * transform.scale,
    y: transform.centerY + point.y * transform.scale,
  };
}

function boundsFor(points: NormalizedLandmark2D[]): Bounds {
  const visible = points.filter((point) => (
    coreLandmarks.has(point.name) && point.confidence >= VISIBLE_CONFIDENCE
  ));
  if (visible.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return {
    minX: Math.min(...visible.map((point) => point.x)),
    maxX: Math.max(...visible.map((point) => point.x)),
    minY: Math.min(...visible.map((point) => point.y)),
    maxY: Math.max(...visible.map((point) => point.y)),
  };
}

function fitBounds(bounds: Bounds, viewport: Bounds): ViewTransform {
  const scale = Math.min(width(viewport) / width(bounds), height(viewport) / height(bounds));
  return {
    centerX: midpointX(viewport) - midpointX(bounds) * scale,
    centerY: midpointY(viewport) - midpointY(bounds) * scale,
    scale,
  };
}

function unionBounds(first: Bounds, second: Bounds): Bounds {
  return {
    minX: Math.min(first.minX, second.minX),
    maxX: Math.max(first.maxX, second.maxX),
    minY: Math.min(first.minY, second.minY),
    maxY: Math.max(first.maxY, second.maxY),
  };
}

function inflateBounds(bounds: Bounds, padding: number): Bounds {
  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minY: bounds.minY - padding,
    maxY: bounds.maxY + padding,
  };
}

function width(bounds: Bounds) {
  return Math.max(0.001, bounds.maxX - bounds.minX);
}

function height(bounds: Bounds) {
  return Math.max(0.001, bounds.maxY - bounds.minY);
}

function midpointX(bounds: Bounds) {
  return (bounds.minX + bounds.maxX) / 2;
}

function midpointY(bounds: Bounds) {
  return (bounds.minY + bounds.maxY) / 2;
}
