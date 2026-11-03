import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSqliteUsageOutbox } from '../metering/create-sqlite-usage-outbox.js';
import { openRuntimeDatabase } from '../open-runtime-database.js';
import { openDatabase } from './open-database.js';

describe('runtime database migrations', () => {
  it('upgrades a file from the first schema and keeps its rows', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'runtime-')), 'runtime.sqlite');
    const first = openDatabase(path, { wal: true });
    first.exec(`CREATE TABLE landing_sessions (token TEXT PRIMARY KEY, results TEXT NOT NULL,
      language TEXT NOT NULL, api_key_id TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, visit_count INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE TABLE usage_events (id TEXT PRIMARY KEY, api_key_id TEXT NOT NULL, tool TEXT NOT NULL,
      result_count INTEGER NOT NULL, latency_ms REAL NOT NULL, status TEXT NOT NULL,
      billable INTEGER NOT NULL, occurred_at TEXT NOT NULL, exported_at TEXT) STRICT;
      INSERT INTO usage_events VALUES ('e1', 'local', 'cite', 1, 3, 'ok', 1, '2026-11-01', NULL);
      PRAGMA user_version = 1;`);
    first.close();

    const db = openRuntimeDatabase(path);
    expect(db.pragma('user_version', { simple: true })).toBe(4);
    expect(db.prepare('SELECT count(*) AS n FROM api_keys').get()).toEqual({ n: 0 });
    const signal = new AbortController().signal;
    const now = new Date('2026-11-03T12:00:00Z');
    const outbox = createSqliteUsageOutbox(db);
    expect(await outbox.claim(10, now, new Date(now.getTime() + 60_000), signal)).toEqual([
      {
        kind: 'tool_call',
        id: 'e1',
        apiKeyId: 'local',
        tool: 'cite',
        resultCount: 1,
        latencyMs: 3,
        status: 'ok',
        billable: true,
        cardsByJournal: [],
        occurredAt: new Date('2026-11-01'),
      },
    ]);
    db.close();
    expect(openRuntimeDatabase(path).pragma('user_version', { simple: true })).toBe(4);
  });
});
