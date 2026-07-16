import type { FastifyInstance } from 'fastify';

import { appError } from '../http/errors.ts';
import {
  parseVideoUpload,
  registerSourceUpload,
  requireField,
  requireShootingHand,
} from '../http/upload.ts';
import { buildReportBundle } from '../report/build-report.ts';

export async function registerComparisonRoutes(app: FastifyInstance) {
  app.post('/api/v1/comparisons', async (request, reply) => {
    const upload = await parseVideoUpload(request);
    const templateId = requireField(upload.fields, 'templateId');
    const shootingHand = requireShootingHand(upload.fields);
    const template = app.services.templates.getActive(templateId);
    if (!template || template.status !== 'ready' || !template.currentArtifactId) {
      throw appError('TEMPLATE_NOT_READY', 'Only a ready template can start a comparison');
    }
    if (template.shootingHand !== shootingHand) {
      throw appError('HAND_MISMATCH', 'User shooting hand must match the selected template', {
        details: { template: template.shootingHand, user: shootingHand },
      });
    }
    let created!: { comparisonId: string; jobId: string };
    app.services.database.transaction(() => {
      const source = registerSourceUpload(request, upload);
      const comparison = app.services.comparisons.create({
        userSourceFileId: source.id,
        templateId: template.id,
        templateArtifactId: template.currentArtifactId,
        shootingHand,
      });
      const job = app.services.jobs.create({ type: 'comparison', entityId: comparison.id });
      created = { comparisonId: comparison.id, jobId: job.id };
    })();
    app.jobRunner.enqueue(created.jobId);
    return reply.status(202).send({ ...created, status: 'queued' });
  });

  app.get('/api/v1/comparisons', async () => {
    return app.services.comparisons.listActive().map((comparison) => {
      const template = app.services.templates.get(comparison.templateId);
      const source = app.services.files.getActive(comparison.userSourceFileId);
      return {
        id: comparison.id,
        status: comparison.status,
        shootingHand: comparison.shootingHand,
        rejectionCode: comparison.rejectionCode,
        error: comparison.error,
        createdAt: comparison.createdAt,
        updatedAt: comparison.updatedAt,
        template: template
          ? { id: template.id, name: template.name }
          : { id: comparison.templateId, name: '已删除的参考模板' },
        userFileName: source?.originalName ?? '未命名视频',
        job: app.services.jobs.findLatestForEntity('comparison', comparison.id),
      };
    });
  });

  app.get<{ Params: { comparisonId: string } }>(
    '/api/v1/comparisons/:comparisonId',
    async (request) => {
      const comparison = app.services.comparisons.getActive(request.params.comparisonId);
      if (!comparison) throw appError('COMPARISON_NOT_FOUND', 'Comparison was not found');
      return {
        ...comparison,
        template: app.services.templates.get(comparison.templateId),
        job: app.services.jobs.findLatestForEntity('comparison', comparison.id),
      };
    },
  );

  app.get<{ Params: { comparisonId: string } }>(
    '/api/v1/comparisons/:comparisonId/report',
    async (request, reply) => {
      const report = await buildReportBundle(app.services, request.params.comparisonId);
      if (request.headers['if-none-match'] === report.etag) {
        return reply.status(304).send();
      }
      return reply.header('etag', report.etag).send(report.bundle);
    },
  );

  app.post<{ Params: { comparisonId: string } }>(
    '/api/v1/comparisons/:comparisonId/rerun',
    async (request, reply) => {
      const original = app.services.comparisons.getActive(request.params.comparisonId);
      if (!original) throw appError('COMPARISON_NOT_FOUND', 'Comparison was not found');
      if (original.status === 'queued' || original.status === 'running') {
        throw appError('JOB_NOT_RETRYABLE', 'A running comparison cannot be rerun');
      }
      const template = app.services.templates.getActive(original.templateId);
      if (!template || template.status !== 'ready' || !template.currentArtifactId) {
        throw appError('TEMPLATE_NOT_READY', 'Selected template is no longer available');
      }
      let created!: { comparisonId: string; jobId: string };
      app.services.database.transaction(() => {
        const comparison = app.services.comparisons.create({
          userSourceFileId: original.userSourceFileId,
          templateId: template.id,
          templateArtifactId: template.currentArtifactId,
          shootingHand: original.shootingHand,
        });
        const job = app.services.jobs.create({ type: 'comparison', entityId: comparison.id });
        created = { comparisonId: comparison.id, jobId: job.id };
      })();
      app.jobRunner.enqueue(created.jobId);
      return reply.status(202).send({ ...created, status: 'queued' });
    },
  );

  app.delete<{ Params: { comparisonId: string } }>(
    '/api/v1/comparisons/:comparisonId',
    async (request, reply) => {
      if (!app.services.comparisons.getActive(request.params.comparisonId)) {
        throw appError('COMPARISON_NOT_FOUND', 'Comparison was not found');
      }
      app.services.comparisons.remove(request.params.comparisonId);
      return reply.status(204).send();
    },
  );
}
