import { apiKeySchema, type ApiKey, type ApiKeyStore } from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { withSignal } from '../with-signal.js';

interface ApiKeyRow {
  readonly id: string;
  readonly label: string;
  readonly secret_hash: string;
  readonly institution_id: string | null;
  readonly created_at: string;
  readonly revoked_at: string | null;
}

/** API keys in the runtime database: ids and secret hashes, never the secrets. */
export function createSqliteApiKeyStore(db: Db): ApiKeyStore {
  const insert = db.prepare(
    `INSERT INTO api_keys (id, label, secret_hash, institution_id, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const select = db.prepare<[string], ApiKeyRow>('SELECT * FROM api_keys WHERE id = ?');
  const revoke = db.prepare(
    'UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  );
  const all = db.prepare<[], ApiKeyRow>('SELECT * FROM api_keys ORDER BY created_at, id');

  return {
    find: (id, signal) =>
      withSignal(signal, () => {
        const row = select.get(id);
        return row === undefined ? undefined : keyFromRow(row);
      }),
    create: (key, signal) =>
      withSignal(signal, () => {
        insert.run(
          key.id,
          key.label,
          key.secretHash,
          key.institutionId ?? null,
          key.createdAt.toISOString(),
          key.revokedAt?.toISOString() ?? null,
        );
      }),
    revoke: (id, at, signal) =>
      withSignal(signal, () => revoke.run(at.toISOString(), id).changes > 0),
    list: (signal) => withSignal(signal, () => all.all().map(keyFromRow)),
  };
}

function keyFromRow(row: ApiKeyRow): ApiKey {
  return apiKeySchema.parse({
    id: row.id,
    label: row.label,
    secretHash: row.secret_hash,
    ...(row.institution_id !== null && { institutionId: row.institution_id }),
    createdAt: new Date(row.created_at),
    ...(row.revoked_at !== null && { revokedAt: new Date(row.revoked_at) }),
  });
}
