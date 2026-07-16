import type { Page } from '@playwright/test';

import { MotionEventNames } from '@shot-ai/contracts';

import { reportFixture } from '../test/report-fixture.ts';

export async function openReadyReport(page: Page) {
  const report = e2eReportFixture();
  await page.route('**/api/v1/comparisons/*/report', (route) => route.fulfill({ json: report }));
  await page.route('**/api/v1/files/*/video', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/debug/comparisons/*/summary', (route) => route.fulfill({
    json: debugSummaryFixture(),
  }));
  await page.goto('/#/reports/cmp_e2e');
  await page.getByRole('heading', { name: '动作对比报告' }).waitFor();
}

function e2eReportFixture() {
  const report = reportFixture();
  const sourceTimeline = report.comparison.renderTimeline;
  const sourceFrames = report.renderFrames;
  const totalSamples = 300;
  const eventSamples = [0, 60, 120, 180, 240, totalSamples - 1];

  // The component fixture intentionally has only six samples so every event is
  // easy to assert. Browser scheduling can consume that 200 ms clip before a
  // mode-switch assertion runs, so E2E expands the same evidence to 10 seconds.
  report.comparison.renderTimeline = Array.from({ length: totalSamples }, (_, sampleIndex) => {
    const progress = sampleIndex / (totalSamples - 1);
    const source = sourceTimeline[Math.round(progress * (sourceTimeline.length - 1))]!;
    const phaseIndex = Math.min(4, Math.floor(sampleIndex / 60));
    const phaseStart = eventSamples[phaseIndex]!;
    const phaseEnd = eventSamples[phaseIndex + 1]!;
    return {
      ...source,
      sampleIndex,
      progress,
      phaseIndex,
      phaseProgress: (sampleIndex - phaseStart) / Math.max(1, phaseEnd - phaseStart),
      templateFrameIndex: sampleIndex * 2,
      templateTimestampMs: sampleIndex * (1000 / 30),
      userFrameIndex: sampleIndex * 3,
      userTimestampMs: sampleIndex * (1000 / 30),
    };
  });
  report.comparison.phases = report.comparison.phases.map((phase, index) => ({
    ...phase,
    startSampleIndex: eventSamples[index]!,
    endSampleIndex: eventSamples[index + 1]!,
  }));
  report.comparison.deviationWindows = [{
    ...report.comparison.deviationWindows[0]!,
    startSampleIndex: 60,
    endSampleIndex: 240,
  }];
  report.comparison.displayTimeline = report.comparison.renderTimeline.map((sample) => ({
    displayFrameIndex: sample.sampleIndex,
    displayTimestampMs: sample.sampleIndex * (1000 / 30),
    alignmentSampleIndex: sample.sampleIndex,
  }));
  report.comparison.previews.frameCount = totalSamples;
  report.comparison.previews.durationMs = (totalSamples / 30) * 1000;
  report.renderFrames = Array.from({ length: totalSamples }, (_, sampleIndex) => {
    const progress = sampleIndex / (totalSamples - 1);
    const source = sourceFrames[Math.round(progress * (sourceFrames.length - 1))]!;
    return { ...source, sampleIndex };
  });
  return report;
}

function debugSummaryFixture() {
  const templateEvents = Object.fromEntries(MotionEventNames.map((name, index) => [name, {
    frameIndex: index * 2,
    timestampMs: index * 100,
    confidence: 0.94 - index * 0.01,
    isProxy: name === 'release_pose_proxy',
  }]));
  const userEvents = Object.fromEntries(MotionEventNames.map((name, index) => [name, {
    frameIndex: index * 3,
    timestampMs: index * 110,
    confidence: 0.92 - index * 0.01,
    isProxy: name === 'release_pose_proxy',
  }]));
  const provenance = {
    modelName: 'pose_landmarker_full',
    modelVersion: 'fixture',
    modelSha256: 'a'.repeat(64),
    pipelineVersion: 'fixture',
    thresholdSnapshot: { regionConfidence: 0.6 },
    stageDurationsMs: { pose: 12 },
  };
  return {
    job: { id: 'job_e2e' },
    quality: {
      checks: [{ code: 'FULL_BODY_VISIBLE', status: 'pass', message: '全身持续在画面内' }],
    },
    artifacts: {
      template: { id: 'artifact_template', artifactSha256: 'b'.repeat(64) },
      user: { id: 'artifact_user', artifactSha256: 'c'.repeat(64) },
    },
    templateArtifactEvidence: { events: templateEvents, provenance },
    artifactEvidence: { events: userEvents, provenance },
  };
}
