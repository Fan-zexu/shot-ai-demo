import { open } from 'node:fs/promises';

import type { FastifyRequest } from 'fastify';

import type { StoredFile } from '../files/file-store.ts';
import { appError } from './errors.ts';

export interface ParsedVideoUpload {
  fields: Record<string, string>;
  stored: StoredFile;
  mimeType: string;
}

async function detectVideoMime(path: string): Promise<string | null> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
      return 'video/mp4';
    }
    if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      return 'video/webm';
    }
    if (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'AVI '
    ) {
      return 'video/x-msvideo';
    }
    return null;
  } finally {
    await handle.close();
  }
}

export async function parseVideoUpload(request: FastifyRequest): Promise<ParsedVideoUpload> {
  const fields: Record<string, string> = {};
  let stored: StoredFile | null = null;
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'file' || stored) {
        part.file.resume();
        throw appError('INVALID_UPLOAD', 'Exactly one file field is required');
      }
      stored = await request.server.services.fileStore.write(part.file, {
        kind: 'source',
        originalName: part.filename,
        maxBytes: request.server.services.maxUploadBytes,
      });
      continue;
    }
    fields[part.fieldname] = String(part.value);
  }
  if (!stored || stored.sizeBytes === 0) {
    throw appError('INVALID_UPLOAD', 'A non-empty video file is required');
  }
  const mimeType = await detectVideoMime(stored.absolutePath);
  if (!mimeType) {
    throw appError('VIDEO_NOT_DECODABLE', 'File signature is not a supported video container');
  }
  return { fields, stored, mimeType };
}

export function requireField(fields: Record<string, string>, name: string) {
  const value = fields[name]?.trim();
  if (!value) throw appError('INVALID_FORM', `${name} is required`);
  return value;
}

export function requireShootingHand(fields: Record<string, string>) {
  const value = requireField(fields, 'shootingHand');
  if (value !== 'left' && value !== 'right') {
    throw appError('INVALID_FORM', 'shootingHand must be left or right');
  }
  return value;
}

export function registerSourceUpload(request: FastifyRequest, upload: ParsedVideoUpload) {
  const existing = request.server.services.files
    .findActiveBySha256(upload.stored.sha256)
    .find((file) => file.kind === 'source' && file.relativePath === upload.stored.relativePath);
  return (
    existing ??
    request.server.services.files.create({
      sha256: upload.stored.sha256,
      kind: 'source',
      originalName: upload.stored.originalName,
      mimeType: upload.mimeType,
      sizeBytes: upload.stored.sizeBytes,
      relativePath: upload.stored.relativePath,
    })
  );
}
