import compress from '@fastify/compress';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';

import type { AppDatabase } from './db/database.ts';
import { sendPublicError } from './http/errors.ts';
import { recoverInterruptedJobs } from './jobs/recovery.ts';
import { JobRunner } from './jobs/runner.ts';
import { registerComparisonRoutes } from './routes/comparisons.ts';
import { registerDebugRoutes } from './routes/debug.ts';
import { registerFileRoutes } from './routes/files.ts';
import { registerJobRoutes } from './routes/jobs.ts';
import { registerTemplateRoutes } from './routes/templates.ts';
import { createServices, type AppServices } from './services.ts';
import type { WorkerClient } from './worker-client/client.ts';

declare module 'fastify' {
  interface FastifyInstance {
    services: AppServices;
    jobRunner: JobRunner;
  }
}

export interface BuildAppOptions {
  database: AppDatabase;
  dataRoot: string;
  worker: WorkerClient;
  maxUploadBytes: number;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.maxUploadBytes,
  });
  const services = createServices(options);
  const jobRunner = new JobRunner({
    fileStore: services.fileStore,
    files: services.files,
    templates: services.templates,
    comparisons: services.comparisons,
    jobs: services.jobs,
    artifacts: services.artifacts,
    results: services.results,
    qualityReports: services.qualityReports,
    worker: services.worker,
    maxStoredBytes: options.maxUploadBytes,
  });
  app.decorate('services', services);
  app.decorate('jobRunner', jobRunner);
  await app.register(cors, {
    origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  });
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(multipart, {
    limits: {
      files: 1,
      fields: 10,
      fileSize: options.maxUploadBytes,
    },
  });
  app.setErrorHandler(sendPublicError);
  app.get('/api/v1/health', async () => ({
    status: 'ready',
    worker: await services.worker.health(),
  }));
  await registerTemplateRoutes(app);
  await registerComparisonRoutes(app);
  await registerJobRoutes(app);
  await registerFileRoutes(app);
  await registerDebugRoutes(app);

  const interrupted = services.jobs.listByStatus('running');
  recoverInterruptedJobs(services.jobs);
  for (const previous of interrupted) {
    const recovered = services.jobs.get(previous.id);
    if (recovered?.status !== 'failed') continue;
    const error = recovered.error ?? {
      code: 'PROCESS_INTERRUPTED_REPEATEDLY',
      category: 'system',
      message: 'Task was interrupted more than once',
      retryable: true,
    };
    if (previous.type === 'template') services.templates.markFailed(previous.entityId, error);
    else services.comparisons.markFailed(previous.entityId, error);
  }
  for (const job of services.jobs.listByStatus('queued')) jobRunner.enqueue(job.id);
  return app;
}
