import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import { AppError } from '../errors.ts';

export type StoredFileKind = 'source' | 'preview' | 'artifact' | 'result' | 'export';

export interface StoredFile {
  sha256: string;
  sizeBytes: number;
  relativePath: string;
  absolutePath: string;
  originalName: string | null;
  kind: StoredFileKind;
}

export class FileStore {
  readonly root: string;
  readonly temporaryDirectory: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.temporaryDirectory = resolve(this.root, 'tmp');
  }

  async write(
    input: Readable,
    options: {
      kind: StoredFileKind;
      originalName?: string;
      maxBytes: number;
    },
  ): Promise<StoredFile> {
    await mkdir(this.temporaryDirectory, { recursive: true });
    const partialPath = resolve(this.temporaryDirectory, `${randomUUID()}.partial`);
    const handle = await open(partialPath, 'wx');
    const hash = createHash('sha256');
    let sizeBytes = 0;

    try {
      for await (const value of input) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as string | Uint8Array);
        sizeBytes += chunk.byteLength;
        if (sizeBytes > options.maxBytes) {
          throw new AppError({
            code: 'FILE_TOO_LARGE',
            category: 'validation',
            message: `FILE_TOO_LARGE: maximum ${options.maxBytes} bytes`,
            retryable: false,
          });
        }
        hash.update(chunk);
        await handle.write(chunk);
      }
    } catch (error) {
      await handle.close();
      await rm(partialPath, { force: true });
      throw error;
    }

    await handle.sync();
    await handle.close();

    const sha256 = hash.digest('hex');
    const prefix = options.kind === 'source' ? 'uploads' : `${options.kind}s`;
    const relativePath = `${prefix}/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
    const absolutePath = this.resolvePath(relativePath);
    await mkdir(resolve(absolutePath, '..'), { recursive: true });

    try {
      await access(absolutePath);
      await rm(partialPath, { force: true });
    } catch {
      await rename(partialPath, absolutePath);
    }

    return {
      sha256,
      sizeBytes,
      relativePath,
      absolutePath,
      originalName: options.originalName ?? null,
      kind: options.kind,
    };
  }

  resolvePath(relativePath: string): string {
    if (isAbsolute(relativePath)) {
      throw this.pathError(relativePath);
    }
    const candidate = resolve(this.root, relativePath);
    const candidateRelative = relative(this.root, candidate);
    if (
      candidateRelative === '..' ||
      candidateRelative.startsWith(`..${sep}`) ||
      isAbsolute(candidateRelative)
    ) {
      throw this.pathError(relativePath);
    }
    return candidate;
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.resolvePath(relativePath));
  }

  async remove(relativePath: string): Promise<void> {
    await rm(this.resolvePath(relativePath), { force: true });
  }

  private pathError(relativePath: string): AppError {
    return new AppError({
      code: 'PATH_OUTSIDE_DATA_ROOT',
      category: 'validation',
      message: `PATH_OUTSIDE_DATA_ROOT: ${relativePath}`,
      retryable: false,
    });
  }
}
