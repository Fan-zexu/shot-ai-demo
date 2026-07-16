import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import { buildApp } from '../src/app.ts';
import { FakeWorkerClient } from './fake-worker.ts';
import {
  createComparison,
  createReadyTemplate,
  multipartRequest,
} from './http-helpers.ts';
import { createTestContext } from './helpers.ts';

async function setup(context: test.TestContext) {
  const testContext = createTestContext();
  const worker = new FakeWorkerClient();
  const app = await buildApp({
    database: testContext.database,
    dataRoot: join(testContext.directory, 'data'),
    worker,
    maxUploadBytes: 5 * 1024 * 1024,
  });
  context.after(async () => {
    await app.close();
    testContext.close();
  });
  return { app, worker };
}

test('template upload becomes ready only after a valid persisted artifact', async (context) => {
  const { app, worker } = await setup(context);
  const response = await app.inject(
    multipartRequest('/api/v1/templates', {
      name: '右手侧面模板',
      shootingHand: 'right',
    }),
  );

  assert.equal(response.statusCode, 202);
  const created = response.json() as { templateId: string; jobId: string };
  await app.jobRunner.drain();
  const template = await app.inject({
    method: 'GET',
    url: `/api/v1/templates/${created.templateId}`,
  });
  const job = await app.inject({ method: 'GET', url: `/api/v1/jobs/${created.jobId}` });

  assert.equal(template.statusCode, 200);
  assert.equal(template.json().status, 'ready');
  assert.equal(template.json().quality.status, 'accepted');
  assert.equal(job.json().status, 'ready');
  assert.equal(job.json().type, 'template');
  assert.equal(job.json().entityId, created.templateId);
  assert.ok(job.json().completedStages.includes('writing_artifact'));
  assert.match(template.json().currentArtifactId, /^artifact_/);
  assert.equal(worker.analyzeRequests[0]?.normalSpeedConfirmed, false);
});

test('same-hand mismatch is rejected before a comparison job is created', async (context) => {
  const { app } = await setup(context);
  const template = await createReadyTemplate(app);

  const response = await createComparison(app, template.templateId, 'left');

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'HAND_MISMATCH');
});

test('a comparison produces one report bundle, aligned previews, and Range video', async (context) => {
  const { app, worker } = await setup(context);
  const template = await createReadyTemplate(app);
  const response = await createComparison(app, template.templateId);
  assert.equal(response.statusCode, 202);
  const created = response.json() as { comparisonId: string; jobId: string };
  await app.jobRunner.drain();

  const comparison = await app.inject({
    method: 'GET',
    url: `/api/v1/comparisons/${created.comparisonId}`,
  });
  const report = await app.inject({
    method: 'GET',
    url: `/api/v1/comparisons/${created.comparisonId}/report`,
  });

  assert.equal(comparison.json().status, 'ready');
  assert.equal(report.statusCode, 200);
  assert.equal(
    report.json().renderFrames.length,
    report.json().comparison.renderTimeline.length,
  );
  assert.match(report.json().comparison.previews.templateVideoFileId, /^file_/);
  assert.match(report.json().comparison.previews.userVideoFileId, /^file_/);
  const videoUrl = report.json().user.previewVideoUrl as string;
  const range = await app.inject({
    method: 'GET',
    url: videoUrl,
    headers: { range: 'bytes=0-7' },
  });
  assert.equal(range.statusCode, 206);
  assert.equal(range.headers['content-range']?.startsWith('bytes 0-7/'), true);
  assert.equal(range.rawPayload.length, 8);
  assert.ok(report.headers.etag);
  const cached = await app.inject({
    method: 'GET',
    url: `/api/v1/comparisons/${created.comparisonId}/report`,
    headers: { 'if-none-match': report.headers.etag! },
  });
  assert.equal(cached.statusCode, 304);
  const compressed = await app.inject({
    method: 'GET',
    url: `/api/v1/comparisons/${created.comparisonId}/report`,
    headers: { 'accept-encoding': 'gzip' },
  });
  assert.equal(compressed.headers['content-encoding'], 'gzip');

  const debugQuality = await app.inject({
    method: 'GET',
    url: `/api/v1/debug/jobs/${created.jobId}/quality-report`,
  });
  const debugSummary = await app.inject({
    method: 'GET',
    url: `/api/v1/debug/comparisons/${created.comparisonId}/summary`,
  });
  const resultExport = await app.inject({
    method: 'GET',
    url: `/api/v1/debug/results/${comparison.json().resultId}`,
  });
  assert.equal(debugQuality.json().status, 'accepted');
  assert.equal(report.json().comparison.provenance.thresholdSnapshot.velocityWeight, 0);
  assert.equal(
    worker.analyzeRequests.find((request) => request.sourceType === 'user')?.normalSpeedConfirmed,
    true,
  );
  assert.equal(debugSummary.json().resultEvidence.compatibility.shootingHand, 'right');
  assert.equal(typeof debugSummary.json().templateArtifactEvidence.events.prep_start.confidence, 'number');
  assert.equal(typeof debugSummary.json().artifactEvidence.events.prep_start.confidence, 'number');
  assert.equal(resultExport.statusCode, 200);
  assert.equal(resultExport.headers['content-type'], 'application/gzip');
});

test('rejected input is not retryable', async (context) => {
  const { app, worker } = await setup(context);
  const template = await createReadyTemplate(app);
  worker.rejectUsers = true;
  const response = await createComparison(app, template.templateId);
  const created = response.json() as { comparisonId: string; jobId: string };
  await app.jobRunner.drain();

  const job = await app.inject({ method: 'GET', url: `/api/v1/jobs/${created.jobId}` });
  const retry = await app.inject({
    method: 'POST',
    url: `/api/v1/jobs/${created.jobId}/retry`,
  });

  assert.equal(job.json().status, 'rejected');
  assert.equal(job.json().type, 'comparison');
  assert.equal(job.json().entityId, created.comparisonId);
  assert.equal(job.json().error.code, 'USER_BODY_OUT_OF_FRAME');
  assert.equal(retry.statusCode, 409);
  assert.equal(retry.json().code, 'JOB_NOT_RETRYABLE');
});

test('a failed Worker call can retry from the persisted source file', async (context) => {
  const { app, worker } = await setup(context);
  const template = await createReadyTemplate(app);
  worker.failUserAttempts = 1;
  const response = await createComparison(app, template.templateId);
  const created = response.json() as { comparisonId: string; jobId: string };
  await app.jobRunner.drain();
  assert.equal(app.services.jobs.get(created.jobId)?.status, 'failed');

  const retry = await app.inject({
    method: 'POST',
    url: `/api/v1/jobs/${created.jobId}/retry`,
  });
  assert.equal(retry.statusCode, 202);
  await app.jobRunner.drain();

  assert.equal(app.services.jobs.get(created.jobId)?.status, 'ready');
  assert.equal(app.services.jobs.get(created.jobId)?.attempt, 2);
  assert.equal(app.services.comparisons.get(created.comparisonId)?.status, 'ready');
});

test('retry resumes from a verified user artifact after preview generation fails', async (context) => {
  const { app, worker } = await setup(context);
  const template = await createReadyTemplate(app);
  worker.failPreviewAttempts = 1;
  const response = await createComparison(app, template.templateId);
  const created = response.json() as { jobId: string };
  await app.jobRunner.drain();
  assert.equal(app.services.jobs.get(created.jobId)?.status, 'failed');
  assert.equal(worker.userAnalyzeCalls, 1);

  await app.inject({ method: 'POST', url: `/api/v1/jobs/${created.jobId}/retry` });
  await app.jobRunner.drain();

  assert.equal(app.services.jobs.get(created.jobId)?.status, 'ready');
  assert.equal(worker.userAnalyzeCalls, 1);
});

test('rerun creates a new immutable comparison result', async (context) => {
  const { app } = await setup(context);
  const template = await createReadyTemplate(app);
  const originalResponse = await createComparison(app, template.templateId);
  const original = originalResponse.json() as { comparisonId: string };
  await app.jobRunner.drain();

  const rerun = await app.inject({
    method: 'POST',
    url: `/api/v1/comparisons/${original.comparisonId}/rerun`,
  });
  assert.equal(rerun.statusCode, 202);
  assert.notEqual(rerun.json().comparisonId, original.comparisonId);
  await app.jobRunner.drain();

  assert.equal(app.services.comparisons.get(original.comparisonId)?.status, 'ready');
  assert.equal(app.services.comparisons.get(rerun.json().comparisonId)?.status, 'ready');
  assert.notEqual(
    app.services.comparisons.get(original.comparisonId)?.resultId,
    app.services.comparisons.get(rerun.json().comparisonId)?.resultId,
  );
});

test('soft-deleting a comparison removes public report and video access', async (context) => {
  const { app } = await setup(context);
  const template = await createReadyTemplate(app);
  const response = await createComparison(app, template.templateId);
  const created = response.json() as { comparisonId: string };
  await app.jobRunner.drain();
  const report = await app.inject({
    method: 'GET',
    url: `/api/v1/comparisons/${created.comparisonId}/report`,
  });
  const videoUrl = report.json().user.previewVideoUrl as string;

  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/v1/comparisons/${created.comparisonId}`,
  });
  const hiddenReport = await app.inject({
    method: 'GET',
    url: `/api/v1/comparisons/${created.comparisonId}/report`,
  });
  const hiddenVideo = await app.inject({ method: 'GET', url: videoUrl });

  assert.equal(removed.statusCode, 204);
  assert.equal(hiddenReport.statusCode, 404);
  assert.equal(hiddenVideo.statusCode, 404);
});

test('unknown file signatures are rejected before a task is created', async (context) => {
  const { app } = await setup(context);
  const response = await app.inject(
    multipartRequest(
      '/api/v1/templates',
      {
        name: 'bad',
        shootingHand: 'right',
        normalSpeedConfirmed: 'true',
      },
      Buffer.from('not-a-video'),
    ),
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VIDEO_NOT_DECODABLE');
  assert.equal(app.services.templates.listActive().length, 0);
});

test('an unreferenced template physically removes its private source and artifact files', async (context) => {
  const { app } = await setup(context);
  const created = await createReadyTemplate(app);
  const template = app.services.templates.get(created.templateId)!;
  const artifact = app.services.artifacts.get(template.currentArtifactId!)!;
  const sourceFile = app.services.files.get(template.sourceFileId)!;
  const artifactFile = app.services.files.get(artifact.artifactFileId)!;

  const response = await app.inject({
    method: 'DELETE',
    url: `/api/v1/templates/${template.id}`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { mode: 'physical' });
  assert.equal(app.services.templates.get(template.id), null);
  assert.equal(app.services.files.get(sourceFile.id), null);
  assert.equal(app.services.files.get(artifactFile.id), null);
  await assert.rejects(app.services.fileStore.read(sourceFile.relativePath));
  await assert.rejects(app.services.fileStore.read(artifactFile.relativePath));
});
