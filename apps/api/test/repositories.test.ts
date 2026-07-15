import assert from 'node:assert/strict';
import test from 'node:test';

import { ComparisonRepository } from '../src/repositories/comparisons.ts';
import { FileRepository } from '../src/repositories/files.ts';
import { TemplateRepository } from '../src/repositories/templates.ts';
import { createTestContext } from './helpers.ts';

test('referenced templates are soft-deleted and unavailable to new comparisons', (context) => {
  const testContext = createTestContext();
  context.after(() => testContext.close());
  const files = new FileRepository(testContext.database);
  const templates = new TemplateRepository(testContext.database);
  const comparisons = new ComparisonRepository(testContext.database);

  const templateFile = files.create({
    sha256: 'a'.repeat(64),
    kind: 'source',
    originalName: 'template.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 12,
    relativePath: `uploads/aa/aa/${'a'.repeat(64)}`,
  });
  const userFile = files.create({
    sha256: 'b'.repeat(64),
    kind: 'source',
    originalName: 'user.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 12,
    relativePath: `uploads/bb/bb/${'b'.repeat(64)}`,
  });
  const template = templates.create({
    name: 'Right-side reference',
    sourceFileId: templateFile.id,
    shootingHand: 'right',
  });
  comparisons.create({
    userSourceFileId: userFile.id,
    templateId: template.id,
    shootingHand: 'right',
  });

  assert.deepEqual(templates.remove(template.id), { mode: 'soft' });
  assert.equal(templates.get(template.id)?.deletedAt === null, false);
  assert.equal(templates.listSelectable().some((item) => item.id === template.id), false);
});

