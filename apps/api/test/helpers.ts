import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabase } from '../src/db/database.ts';

export function createTestContext() {
  const directory = mkdtempSync(join(tmpdir(), 'shot-ai-api-'));
  const database = createDatabase(join(directory, 'test.sqlite'));

  return {
    directory,
    database,
    close() {
      database.close();
      rmSync(directory, { force: true, recursive: true });
    },
  };
}

