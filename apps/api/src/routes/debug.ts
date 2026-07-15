import { createReadStream } from 'node:fs';

import type { FastifyInstance } from 'fastify';

import { ComparisonResultSchema, MotionArtifactSchema } from '@shot-ai/contracts';

import { readGzipArtifact } from '../artifacts/io.ts';
import { appError } from '../http/errors.ts';

export async function registerDebugRoutes(app: FastifyInstance) {
  app.get<{ Params: { artifactId: string } }>(
    '/api/v1/debug/artifacts/:artifactId',
    async (request, reply) => {
      const artifact = app.services.artifacts.get(request.params.artifactId);
      if (!artifact) throw appError('ARTIFACT_NOT_FOUND', 'Artifact was not found');
      const file = app.services.files.getActive(artifact.artifactFileId);
      if (!file) throw appError('FILE_NOT_FOUND', 'Artifact file was not found');
      return reply
        .header('content-type', 'application/gzip')
        .header('content-disposition', `attachment; filename="${artifact.id}.motion.json.gz"`)
        .send(createReadStream(app.services.fileStore.resolvePath(file.relativePath)));
    },
  );

  app.get<{ Params: { jobId: string } }>(
    '/api/v1/debug/jobs/:jobId/quality-report',
    async (request) => {
      const report = app.services.qualityReports.get(request.params.jobId);
      if (!report) throw appError('QUALITY_REPORT_NOT_FOUND', 'Quality report was not found');
      return report.report;
    },
  );

  app.get<{ Params: { resultId: string } }>(
    '/api/v1/debug/results/:resultId',
    async (request, reply) => {
      const result = app.services.results.get(request.params.resultId);
      if (!result) throw appError('RESULT_NOT_FOUND', 'Comparison result was not found');
      const file = app.services.files.getActive(result.resultFileId);
      if (!file) throw appError('FILE_NOT_FOUND', 'Comparison result file was not found');
      return reply
        .header('content-type', 'application/gzip')
        .header('content-disposition', `attachment; filename="${result.id}.comparison.json.gz"`)
        .send(createReadStream(app.services.fileStore.resolvePath(file.relativePath)));
    },
  );

  app.get<{ Params: { comparisonId: string } }>(
    '/api/v1/debug/comparisons/:comparisonId/summary',
    async (request) => {
      const comparison = app.services.comparisons.get(request.params.comparisonId);
      if (!comparison) throw appError('COMPARISON_NOT_FOUND', 'Comparison was not found');
      const job = app.services.jobs.findLatestForEntity('comparison', comparison.id);
      const quality = job ? app.services.qualityReports.get(job.id)?.report ?? null : null;
      const userArtifact = comparison.userArtifactId
        ? app.services.artifacts.get(comparison.userArtifactId)
        : null;
      const templateArtifact = comparison.templateArtifactId
        ? app.services.artifacts.get(comparison.templateArtifactId)
        : null;
      let artifactEvidence = null;
      if (userArtifact) {
        const file = app.services.files.getActive(userArtifact.artifactFileId);
        if (file) {
          const artifact = await readGzipArtifact(
            app.services.fileStore.resolvePath(file.relativePath),
            MotionArtifactSchema,
          );
          artifactEvidence = {
            events: artifact.events,
            provenance: artifact.provenance,
            quality: artifact.quality,
          };
        }
      }
      let resultEvidence = null;
      if (comparison.resultId) {
        const result = app.services.results.get(comparison.resultId);
        const file = result ? app.services.files.getActive(result.resultFileId) : null;
        if (file) {
          const parsed = await readGzipArtifact(
            app.services.fileStore.resolvePath(file.relativePath),
            ComparisonResultSchema,
          );
          resultEvidence = {
            compatibility: parsed.compatibility,
            phases: parsed.phases,
            deviationWindows: parsed.deviationWindows,
            provenance: parsed.provenance,
          };
        }
      }
      return {
        comparison,
        job,
        quality,
        artifacts: { template: templateArtifact, user: userArtifact },
        artifactEvidence,
        resultEvidence,
      };
    },
  );
}
