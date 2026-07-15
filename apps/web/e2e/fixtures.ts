import type { Page } from '@playwright/test';

import { MotionEventNames } from '@shot-ai/contracts';

import { reportFixture } from '../test/report-fixture.ts';

export async function openReadyReport(page: Page) {
  const report = reportFixture();
  await page.route('**/api/v1/comparisons/*/report', (route) => route.fulfill({ json: report }));
  await page.route('**/api/v1/files/*/video', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/debug/comparisons/*/summary', (route) => route.fulfill({
    json: debugSummaryFixture(),
  }));
  await page.goto('/#/reports/cmp_e2e');
  await page.getByRole('heading', { name: '动作对比报告' }).waitFor();
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
