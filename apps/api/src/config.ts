import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export interface ApiSettings {
  dataRoot: string;
  databasePath: string;
  workerBaseUrl: string;
  host: string;
  port: number;
  maxUploadBytes: number;
  workerTimeoutMs: number;
}

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function loadSettings(environment: NodeJS.ProcessEnv = process.env): ApiSettings {
  const dataRoot = resolve(environment.SHOT_AI_DATA_ROOT ?? resolve(repositoryRoot, 'data'));
  return {
    dataRoot,
    databasePath: resolve(environment.SHOT_AI_DATABASE_PATH ?? resolve(dataRoot, 'shot-ai.sqlite')),
    workerBaseUrl: environment.SHOT_AI_WORKER_URL ?? 'http://127.0.0.1:8001',
    host: environment.SHOT_AI_API_HOST ?? '127.0.0.1',
    port: Number(environment.SHOT_AI_API_PORT ?? 3001),
    maxUploadBytes: Number(environment.SHOT_AI_MAX_UPLOAD_BYTES ?? 300 * 1024 * 1024),
    workerTimeoutMs: Number(environment.SHOT_AI_WORKER_TIMEOUT_MS ?? 300_000),
  };
}
