import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const modelUrl = new URL(
  process.env.POSE_MODEL_URL ??
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
);
const destination = resolve(process.env.POSE_MODEL_PATH ?? 'models/pose_landmarker_full.task');
const partial = `${destination}.partial`;

await mkdir(dirname(destination), { recursive: true });

try {
  const existing = await readFile(destination);
  console.log(`model already exists: ${destination}`);
  console.log(`sha256: ${createHash('sha256').update(existing).digest('hex')}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;

  const response = await fetch(modelUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`model download failed: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(partial, bytes, { flag: 'wx' });
  await rename(partial, destination);
  console.log(`model downloaded: ${destination}`);
  console.log(`sha256: ${createHash('sha256').update(bytes).digest('hex')}`);
}

await rm(partial, { force: true });

