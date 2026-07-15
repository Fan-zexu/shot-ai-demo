import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

export type AppDatabase = Database.Database;

const migration = readFileSync(
  new URL('../../migrations/001_initial.sql', import.meta.url),
  'utf8',
);

export function createDatabase(databasePath: string): AppDatabase {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.exec(migration);
  return database;
}

