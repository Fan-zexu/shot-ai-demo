import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import type { ApiError } from '@shot-ai/contracts';

import { AppError } from '../errors.ts';

function statusFor(error: AppError) {
  if (error.code.endsWith('_NOT_FOUND')) return 404;
  if (
    error.code === 'JOB_NOT_RETRYABLE' ||
    error.code === 'REPORT_NOT_READY' ||
    error.code === 'TEMPLATE_NOT_READY'
  ) {
    return 409;
  }
  if (error.category === 'validation' || error.category === 'rejection') return 400;
  if (error.code === 'WORKER_UNAVAILABLE') return 503;
  return 500;
}

export function appError(
  code: string,
  message: string,
  options: {
    category?: AppError['category'];
    retryable?: boolean;
    details?: Record<string, unknown>;
  } = {},
) {
  return new AppError({
    code,
    category: options.category ?? 'validation',
    message,
    retryable: options.retryable ?? false,
    ...(options.details ? { details: options.details } : {}),
  });
}

export function sendPublicError(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  let resolved: AppError;
  if (error instanceof AppError) {
    resolved = error;
  } else if (
    'code' in error &&
    error.code === 'FST_REQ_FILE_TOO_LARGE'
  ) {
    resolved = appError('FILE_TOO_LARGE', 'Uploaded file exceeds the configured limit');
  } else if ('code' in error && error.code === 'FST_FILES_LIMIT') {
    resolved = appError('INVALID_UPLOAD', 'Exactly one file is allowed');
  } else {
    request.log.error({ error }, 'unhandled API error');
    resolved = appError('INTERNAL_SERVER_ERROR', 'Unexpected server error', {
      category: 'system',
      retryable: true,
    });
  }
  const body: ApiError = {
    code: resolved.code,
    category: resolved.category,
    message: resolved.message,
    retryable: resolved.retryable,
    ...(resolved.details ? { details: resolved.details } : {}),
    requestId: request.id,
  };
  void reply.status(statusFor(resolved)).send(body);
}
