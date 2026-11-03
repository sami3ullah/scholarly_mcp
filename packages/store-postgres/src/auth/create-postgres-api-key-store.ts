import { apiKeySchema, type ApiKey, type ApiKeyStore } from '@scholarly-mcp/core';
import { query, type Pool } from '../database/pool.js';

interface ApiKeyRow {
  readonly id: string;
  readonly label: string;
  readonly secret_hash: string;
  readonly institution_id: string | null;
  readonly created_at: Date;
  readonly revoked_at: Date | null;
}

/** API keys in Postgres: ids and secret hashes, never the secrets. */
export function createPostgresApiKeyStore(pool: Pool): ApiKeyStore {
  return {
    find: async (id, signal) => {
      const { rows } = await query<ApiKeyRow>(
        pool,
        signal,
        'SELECT * FROM scholarly.api_keys WHERE id = $1',
        [id],
      );
      const row = rows[0];
      return row === undefined ? undefined : keyFromRow(row);
    },
    create: async (key, signal) => {
      await query(
        pool,
        signal,
        `INSERT INTO scholarly.api_keys
           (id, label, secret_hash, institution_id, created_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          key.id,
          key.label,
          key.secretHash,
          key.institutionId ?? null,
          key.createdAt,
          key.revokedAt ?? null,
        ],
      );
    },
    revoke: async (id, at, signal) => {
      const result = await query(
        pool,
        signal,
        'UPDATE scholarly.api_keys SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL',
        [at, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
    list: async (signal) => {
      const { rows } = await query<ApiKeyRow>(
        pool,
        signal,
        'SELECT * FROM scholarly.api_keys ORDER BY created_at, id',
      );
      return rows.map(keyFromRow);
    },
  };
}

function keyFromRow(row: ApiKeyRow): ApiKey {
  return apiKeySchema.parse({
    id: row.id,
    label: row.label,
    secretHash: row.secret_hash,
    ...(row.institution_id !== null && { institutionId: row.institution_id }),
    createdAt: row.created_at,
    ...(row.revoked_at !== null && { revokedAt: row.revoked_at }),
  });
}
