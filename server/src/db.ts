import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      difficulty  TEXT NOT NULL,
      seed        TEXT NOT NULL,
      config      TEXT NOT NULL,          -- JSON snapshot: count, types, penalties
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      current     INTEGER NOT NULL DEFAULT 0,
      hints_used  TEXT NOT NULL DEFAULT '[]', -- JSON: hints used per question
      hints       INTEGER NOT NULL DEFAULT 0,
      wrong       INTEGER NOT NULL DEFAULT 0,
      total_ms    INTEGER
    );
    CREATE INDEX IF NOT EXISTS runs_board ON runs (difficulty, finished_at, total_ms);
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}
