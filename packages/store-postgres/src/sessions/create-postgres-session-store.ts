import { landingSessionSchema, type LandingSession, type SessionStore } from '@scholarly-mcp/core';
import { query, type Pool } from '../database/pool.js';

interface SessionRow {
  readonly token: string;
  readonly results: unknown;
  readonly language: string;
  readonly tool: string | null;
  readonly api_key_id: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly visit_count: number;
}

/**
 * Landing sessions in Postgres, shared by every server replica, so a landing link works
 * whichever one answers it (ADR 0032, ADR 0034). Rows hold result DOIs and matched chunk
 * ids only, never query text.
 */
export function createPostgresSessionStore(pool: Pool): SessionStore {
  return {
    save: async (session, signal) => {
      await query(
        pool,
        signal,
        `INSERT INTO scholarly.landing_sessions
           (token, results, language, tool, api_key_id, created_at, expires_at, visit_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (token) DO UPDATE SET results = excluded.results,
           language = excluded.language, tool = excluded.tool, api_key_id = excluded.api_key_id,
           created_at = excluded.created_at, expires_at = excluded.expires_at,
           visit_count = excluded.visit_count`,
        [
          session.token,
          JSON.stringify(session.results),
          session.language,
          session.tool ?? null,
          session.apiKeyId,
          session.createdAt,
          session.expiresAt,
          session.visitCount,
        ],
      );
    },
    find: async (token, signal) => {
      const { rows } = await query<SessionRow>(
        pool,
        signal,
        'SELECT * FROM scholarly.landing_sessions WHERE token = $1',
        [token],
      );
      const row = rows[0];
      return row === undefined ? undefined : sessionFromRow(row);
    },
    recordVisit: async (token, signal) => {
      await query(
        pool,
        signal,
        'UPDATE scholarly.landing_sessions SET visit_count = visit_count + 1 WHERE token = $1',
        [token],
      );
    },
    deleteExpired: async (now, signal) => {
      const result = await query(
        pool,
        signal,
        'DELETE FROM scholarly.landing_sessions WHERE expires_at < $1',
        [now],
      );
      return result.rowCount ?? 0;
    },
  };
}

function sessionFromRow(row: SessionRow): LandingSession {
  return landingSessionSchema.parse({
    token: row.token,
    results: row.results,
    language: row.language,
    apiKeyId: row.api_key_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    visitCount: row.visit_count,
    ...(row.tool !== null && { tool: row.tool }),
  });
}
