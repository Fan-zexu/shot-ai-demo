import type { FastifyInstance } from 'fastify';

const CRLF = '\r\n';

export const videoBytes = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(64, 7),
]);

export function multipartRequest(
  url: string,
  fields: Record<string, string>,
  file: Buffer = videoBytes,
) {
  const boundary = `shot-ai-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="shot.mp4"${CRLF}Content-Type: video/mp4${CRLF}${CRLF}`,
    ),
    file,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  );
  return {
    method: 'POST' as const,
    url,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}

export async function createReadyTemplate(app: FastifyInstance) {
  const response = await app.inject(
    multipartRequest('/api/v1/templates', {
      name: '右手侧面模板',
      shootingHand: 'right',
    }),
  );
  const created = response.json() as { templateId: string; jobId: string };
  await app.jobRunner.drain();
  return created;
}

export async function createComparison(
  app: FastifyInstance,
  templateId: string,
  shootingHand: 'left' | 'right' = 'right',
) {
  return app.inject(
    multipartRequest('/api/v1/comparisons', {
      templateId,
      shootingHand,
    }),
  );
}
