import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

import { Value } from '@sinclair/typebox/value';
import type { TSchema, Static } from '@sinclair/typebox';

import { AppError } from '../errors.ts';

const gunzipAsync = promisify(gunzip);

export async function readGzipArtifact<Schema extends TSchema>(
  path: string,
  schema: Schema,
): Promise<Static<Schema>> {
  let value: unknown;
  try {
    const compressed = await readFile(path);
    value = JSON.parse((await gunzipAsync(compressed)).toString('utf8')) as unknown;
  } catch (error) {
    throw new AppError({
      code: 'ARTIFACT_SCHEMA_INVALID',
      category: 'system',
      message: 'Worker artifact could not be decoded',
      retryable: false,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }
  if (!Value.Check(schema, value)) {
    const first = Value.Errors(schema, value).First();
    throw new AppError({
      code: 'ARTIFACT_SCHEMA_INVALID',
      category: 'system',
      message: 'Worker artifact does not satisfy the shared schema',
      retryable: false,
      ...(first ? { details: { path: first.path, message: first.message } } : {}),
    });
  }
  return value as Static<Schema>;
}

export function assertSchema<Schema extends TSchema>(
  schema: Schema,
  value: unknown,
  code: string,
): asserts value is Static<Schema> {
  if (Value.Check(schema, value)) return;
  const first = Value.Errors(schema, value).First();
  throw new AppError({
    code,
    category: 'system',
    message: `${code}: generated data does not satisfy its shared schema`,
    retryable: false,
    ...(first ? { details: { path: first.path, message: first.message } } : {}),
  });
}
