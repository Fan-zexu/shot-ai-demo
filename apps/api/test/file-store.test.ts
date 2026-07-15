import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import test from 'node:test';

import { FileStore } from '../src/files/file-store.ts';
import { createTestContext } from './helpers.ts';

test('file store hashes bytes and never uses the original name as a path', async (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());
  const store = new FileStore(testContext.directory);

  const stored = await store.write(Readable.from(['video-bytes']), {
    kind: 'source',
    originalName: '../../shot.mp4',
    maxBytes: 1024,
  });

  assert.equal(stored.sha256, createHash('sha256').update('video-bytes').digest('hex'));
  assert.match(stored.relativePath, /^uploads\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}$/);
  assert.equal(stored.relativePath.includes('shot.mp4'), false);
  assert.deepEqual(await store.read(stored.relativePath), Buffer.from('video-bytes'));
});

test('file store removes partial data when the byte limit is exceeded', async (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());
  const store = new FileStore(testContext.directory);

  await assert.rejects(
    store.write(Readable.from(['too-large']), {
      kind: 'source',
      originalName: 'large.mp4',
      maxBytes: 2,
    }),
    /FILE_TOO_LARGE/,
  );

  assert.deepEqual(await readdir(`${testContext.directory}/tmp`), []);
});

test('file store rejects traversal when resolving an existing path', (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());
  const store = new FileStore(testContext.directory);

  assert.throws(() => store.resolvePath('../outside'), /PATH_OUTSIDE_DATA_ROOT/);
});
