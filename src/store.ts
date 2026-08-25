// SQLite persistence via node:sqlite (built into Node >= 22.5).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ClaimRecord, DailyIndex } from './types';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'rxtruth.db');

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      source_url TEXT,
      source_name TEXT,
      harvest_query TEXT,
      harvested_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      verification_json TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_index (
      date TEXT PRIMARY KEY,
      index_json TEXT NOT NULL
    );
  `);
  return db;
}

export function initStore(): void {
  getDb();
}

function rowToRecord(row: {
  id: string;
  text: string;
  source_url: string | null;
  source_name: string | null;
  harvest_query: string;
  harvested_at: string;
  status: string;
  error: string | null;
  verification_json: string | null;
}): ClaimRecord {
  return {
    claim: {
      id: row.id,
      text: row.text,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      harvestQuery: row.harvest_query,
      harvestedAt: row.harvested_at,
    },
    verification: row.verification_json ? JSON.parse(row.verification_json) : null,
    status: row.status as ClaimRecord['status'],
    error: row.error ?? undefined,
  };
}

export function saveClaim(record: ClaimRecord): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO claims (id, text, source_url, source_name, harvest_query, harvested_at, status, error, verification_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status=excluded.status,
       error=excluded.error,
       verification_json=excluded.verification_json`
  ).run(
    record.claim.id,
    record.claim.text,
    record.claim.sourceUrl,
    record.claim.sourceName,
    record.claim.harvestQuery,
    record.claim.harvestedAt,
    record.status,
    record.error ?? null,
    record.verification ? JSON.stringify(record.verification) : null
  );
}

export function getClaimByHash(id: string): ClaimRecord | undefined {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM claims WHERE id = ?`).get(id) as
    | {
        id: string;
        text: string;
        source_url: string | null;
        source_name: string | null;
        harvest_query: string;
        harvested_at: string;
        status: string;
        error: string | null;
        verification_json: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return rowToRecord(row);
}

export function getClaimsSince(iso: string): ClaimRecord[] {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM claims WHERE harvested_at >= ? AND status = 'verified' ORDER BY harvested_at ASC`)
    .all(iso) as any[];
  return rows.map(rowToRecord);
}

export function saveIndex(idx: DailyIndex): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO daily_index (date, index_json) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET index_json=excluded.index_json`
  ).run(idx.date, JSON.stringify(idx));
}

export function getIndexByDate(date: string): DailyIndex | undefined {
  const d = getDb();
  const row = d.prepare(`SELECT index_json FROM daily_index WHERE date = ?`).get(date) as
    | { index_json: string }
    | undefined;
  return row ? JSON.parse(row.index_json) : undefined;
}

export function closeStore(): void {
  db?.close();
  db = null;
}
