import type { FastifyInstance } from 'fastify';

import type { JobSummary } from '@shot-ai/contracts';

import { appError } from '../http/errors.ts';

export async function registerJobRoutes(app: FastifyInstance) {
  app.get<{ Params: { jobId: string } }>('/api/v1/jobs/:jobId', async (request) => {
    const job = app.services.jobs.get(request.params.jobId);
    if (!job) throw appError('JOB_NOT_FOUND', 'Job was not found');
    const summary: JobSummary = {
      id: job.id,
      type: job.type,
      entityId: job.entityId,
      status: job.status,
      stage: job.stage,
      completedStages: job.completedStages,
      attempt: job.attempt,
      error: job.error,
      updatedAt: job.updatedAt,
    };
    return summary;
  });

  app.post<{ Params: { jobId: string } }>(
    '/api/v1/jobs/:jobId/retry',
    async (request, reply) => {
      if (!app.services.jobs.get(request.params.jobId)) {
        throw appError('JOB_NOT_FOUND', 'Job was not found');
      }
      const job = app.services.jobs.retry(request.params.jobId);
      app.jobRunner.enqueue(job.id);
      return reply.status(202).send({ jobId: job.id, status: job.status, attempt: job.attempt });
    },
  );
}
