import { buildApp } from './app.ts';
import { loadSettings } from './config.ts';
import { createDatabase } from './db/database.ts';
import { HttpWorkerClient } from './worker-client/http-worker-client.ts';

const settings = loadSettings();
const database = createDatabase(settings.databasePath);
const worker = new HttpWorkerClient(settings.workerBaseUrl, settings.workerTimeoutMs);
const app = await buildApp({
  database,
  dataRoot: settings.dataRoot,
  worker,
  maxUploadBytes: settings.maxUploadBytes,
  logger: true,
});

app.addHook('onClose', async () => database.close());

const close = async () => {
  await app.close();
  process.exitCode = 0;
};
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await app.listen({ host: settings.host, port: settings.port });
