import { expect, test } from 'vitest';

import { fitReportToView, projectNormalizedPoint } from '../src/report/fit-to-view.ts';
import { CORE_DISPLAY_LANDMARKS } from '../src/report/Skeleton.tsx';
import { reportFixture } from './report-fixture.ts';

const core = new Set<string>(CORE_DISPLAY_LANDMARKS);

test('one stable overlay transform keeps the full action and channel stroke inside the safe viewport', () => {
  const report = reportFixture();
  report.renderFrames[1]!.templateNormalizedSkeleton.find((point) => point.name === 'right_wrist')!.y = -2.1;
  report.renderFrames[4]!.userNormalizedSkeleton.find((point) => point.name === 'left_foot_index')!.y = 1.9;
  const fit = fitReportToView(report);
  const channelPadding = Math.max(...Object.values(report.comparison.visualization.channelRadiusByRegion))
    * fit.overlay.scale * 1.1;

  for (const frame of report.renderFrames) {
    for (const point of [...frame.templateNormalizedSkeleton, ...frame.userNormalizedSkeleton]) {
      if (!core.has(point.name) || point.confidence < 0.35) continue;
      const projected = projectNormalizedPoint(point, fit.overlay);
      expect(projected.x - channelPadding).toBeGreaterThanOrEqual(fit.safeMarginPx);
      expect(projected.x + channelPadding).toBeLessThanOrEqual(480 - fit.safeMarginPx);
      expect(projected.y - channelPadding).toBeGreaterThanOrEqual(fit.safeMarginPx);
      expect(projected.y + channelPadding).toBeLessThanOrEqual(400 - fit.safeMarginPx);
    }
  }
});

test('low-confidence outliers do not change the action-wide transform', () => {
  const report = reportFixture();
  const outlier = report.renderFrames[3]!.userNormalizedSkeleton.find((point) => point.name === 'left_wrist')!;
  outlier.confidence = 0.2;
  const baseline = fitReportToView(report);
  outlier.x = 99;
  outlier.y = -99;

  expect(fitReportToView(report)).toEqual(baseline);
});

test('separated layout uses one scale and keeps both full actions in their own half', () => {
  const report = reportFixture();
  const fit = fitReportToView(report);

  expect(fit.separated.template.scale).toBe(fit.separated.user.scale);
  for (const [field, transform, minimumX, maximumX] of [
    ['templateNormalizedSkeleton', fit.separated.template, fit.safeMarginPx, 240 - fit.safeMarginPx],
    ['userNormalizedSkeleton', fit.separated.user, 240 + fit.safeMarginPx, 480 - fit.safeMarginPx],
  ] as const) {
    for (const frame of report.renderFrames) {
      for (const point of frame[field]) {
        if (!core.has(point.name) || point.confidence < 0.35) continue;
        const projected = projectNormalizedPoint(point, transform);
        expect(projected.x).toBeGreaterThanOrEqual(minimumX);
        expect(projected.x).toBeLessThanOrEqual(maximumX);
        expect(projected.y).toBeGreaterThanOrEqual(fit.safeMarginPx);
        expect(projected.y).toBeLessThanOrEqual(400 - fit.safeMarginPx);
      }
    }
  }
});
