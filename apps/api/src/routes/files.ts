import { createReadStream } from 'node:fs';

import type { FastifyInstance } from 'fastify';

import { appError } from '../http/errors.ts';
import { parseByteRange } from '../report/range.ts';

export async function registerFileRoutes(app: FastifyInstance) {
  app.get<{ Params: { fileId: string } }>(
    '/api/v1/files/:fileId/video',
    async (request, reply) => {
      const file = app.services.files.getActive(request.params.fileId);
      if (
        !file ||
        !['source', 'preview'].includes(file.kind) ||
        !app.services.files.isReferencedVideo(file.id)
      ) {
        throw appError('FILE_NOT_FOUND', 'Referenced video was not found');
      }
      let range;
      try {
        range = parseByteRange(request.headers.range, file.sizeBytes);
      } catch {
        return reply
          .status(416)
          .header('content-range', `bytes */${file.sizeBytes}`)
          .send();
      }
      const path = app.services.fileStore.resolvePath(file.relativePath);
      reply.header('accept-ranges', 'bytes').header('content-type', file.mimeType);
      if (!range) {
        return reply.header('content-length', file.sizeBytes).send(createReadStream(path));
      }
      return reply
        .status(206)
        .header('content-length', range.length)
        .header('content-range', `bytes ${range.start}-${range.end}/${file.sizeBytes}`)
        .send(createReadStream(path, { start: range.start, end: range.end }));
    },
  );
}
