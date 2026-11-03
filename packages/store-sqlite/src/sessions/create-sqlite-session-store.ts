import { landingSessionSchema, type SessionStore } from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { withSignal } from '../with-signal.js';

interface SessionRow {
  readonly token: string;
  readonly results: string;
  readonly language: string;
  readonly api_key_id: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly visit_count: number;
  readonly tool: string | null;
}

/**
 * Landing sessions in the runtime database (key design decision 12). Rows hold result DOIs
 * and matched chunk ids only, never query text.
 */
export function createSqliteSessionStore(db: Db): SessionStore {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO landing_sessions
       (token, results, language, api_key_id, created_at, expires_at, visit_count, tool)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const select = db.prepare<[string], SessionRow>('SELECT * FROM landing_sessions WHERE token = ?');
  const visit = db.prepare(
    'UPDATE landing_sessions SET visit_count = visit_count + 1 WHERE token = ?',
  );
  const expire = db.prepare('DELETE FROM landing_sessions WHERE expires_at < ?');

  return {
    save: (session, signal) =>
      withSignal(signal, () => {
        insert.run(
          session.token,
          JSON.stringify(session.results),
          session.language,
          session.apiKeyId,
          session.createdAt.toISOString(),
          session.expiresAt.toISOString(),
          session.visitCount,
          session.tool ?? null,
        );
      }),
    find: (token, signal) =>
      withSignal(signal, () => {
        const row = select.get(token);
        return row === undefined ? undefined : sessionFromRow(row);
      }),
    recordVisit: (token, signal) =>
      withSignal(signal, () => {
        visit.run(token);
      }),
    deleteExpired: (now, signal) => withSignal(signal, () => expire.run(now.toISOString()).changes),
  };
}

function sessionFromRow(row: SessionRow) {
  return landingSessionSchema.parse({
    token: row.token,
    results: JSON.parse(row.results) as unknown,
    language: row.language,
    apiKeyId: row.api_key_id,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    visitCount: row.visit_count,
    ...(row.tool !== null && { tool: row.tool }),
  });
}
