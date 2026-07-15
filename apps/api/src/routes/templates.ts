import type { FastifyInstance } from 'fastify';

import { appError } from '../http/errors.ts';
import {
  parseVideoUpload,
  registerSourceUpload,
  requireField,
  requireNormalSpeed,
  requireShootingHand,
} from '../http/upload.ts';

export async function registerTemplateRoutes(app: FastifyInstance) {
  app.post('/api/v1/templates', async (request, reply) => {
    const upload = await parseVideoUpload(request);
    const name = requireField(upload.fields, 'name');
    if (name.length > 80) throw appError('INVALID_FORM', 'Template name must be at most 80 characters');
    const shootingHand = requireShootingHand(upload.fields);
    requireNormalSpeed(upload.fields);
    let created!: { templateId: string; jobId: string };
    app.services.database.transaction(() => {
      const source = registerSourceUpload(request, upload);
      const template = app.services.templates.create({ name, sourceFileId: source.id, shootingHand });
      const job = app.services.jobs.create({ type: 'template', entityId: template.id });
      created = { templateId: template.id, jobId: job.id };
    })();
    app.jobRunner.enqueue(created.jobId);
    return reply.status(202).send({ ...created, status: 'queued' });
  });

  app.get('/api/v1/templates', async (request) => {
    const query = request.query as { status?: string };
    const templates =
      query.status === 'ready'
        ? app.services.templates.listSelectable()
        : app.services.templates.listActive();
    return templates.map((template) => ({
      ...template,
      job: app.services.jobs.findLatestForEntity('template', template.id),
    }));
  });

  app.get<{ Params: { templateId: string } }>(
    '/api/v1/templates/:templateId',
    async (request) => {
      const template = app.services.templates.getActive(request.params.templateId);
      if (!template) throw appError('TEMPLATE_NOT_FOUND', 'Template was not found');
      const job = app.services.jobs.findLatestForEntity('template', template.id);
      const source = app.services.files.getActive(template.sourceFileId);
      const quality = job ? app.services.qualityReports.get(job.id) : null;
      return {
        ...template,
        source: source
          ? {
              fileName: source.originalName,
              mimeType: source.mimeType,
              sizeBytes: source.sizeBytes,
              videoUrl: `/api/v1/files/${source.id}/video`,
            }
          : null,
        quality: quality?.report ?? null,
        job,
      };
    },
  );

  app.delete<{ Params: { templateId: string } }>(
    '/api/v1/templates/:templateId',
    async (request, reply) => {
      const template = app.services.templates.getActive(request.params.templateId);
      if (!template) {
        throw appError('TEMPLATE_NOT_FOUND', 'Template was not found');
      }
      const artifact = template.currentArtifactId
        ? app.services.artifacts.get(template.currentArtifactId)
        : null;
      const result = app.services.templates.remove(request.params.templateId);
      if (result.mode === 'physical') {
        app.services.jobs.removeForEntity('template', template.id);
        if (artifact) app.services.artifacts.remove(artifact.id);
        const fileIds = [artifact?.artifactFileId, template.sourceFileId].filter(
          (value): value is string => Boolean(value),
        );
        for (const fileId of fileIds) {
          const removed = app.services.files.removeIfUnreferenced(fileId);
          if (removed) await app.services.fileStore.remove(removed.relativePath);
        }
      }
      return reply.send(result);
    },
  );
}
