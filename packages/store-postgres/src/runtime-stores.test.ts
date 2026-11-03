import {
  runApiKeyStoreContract,
  runRateBucketStoreContract,
  runSessionStoreContract,
  runUsageOutboxContract,
} from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { createPostgresApiKeyStore } from './auth/create-postgres-api-key-store.js';
import {
  RUNTIME_SCHEMA_VERSION,
  assertMigrated,
  migrateDatabase,
} from './database/runtime-schema.js';
import { createPostgresBucketStore } from './limits/create-postgres-bucket-store.js';
import { createPostgresUsageOutbox } from './metering/create-postgres-usage-outbox.js';
import { createPostgresSessionStore } from './sessions/create-postgres-session-store.js';
import { freshPool } from './testing/fresh-database.js';

const signal = new AbortController().signal;

async function migratedPool() {
  const pool = await freshPool();
  await migrateDatabase(pool, signal);
  return pool;
}

runSessionStoreContract('Postgres session store', async () =>
  createPostgresSessionStore(await migratedPool()),
);
runApiKeyStoreContract('Postgres API key store', async () =>
  createPostgresApiKeyStore(await migratedPool()),
);
runUsageOutboxContract('Postgres usage outbox', async () =>
  createPostgresUsageOutbox(await migratedPool()),
);
runRateBucketStoreContract('Postgres bucket store', async () =>
  createPostgresBucketStore(await migratedPool()),
);

describe('runtime migrations', () => {
  it('migrates once, however many processes start together', async () => {
    const pool = await freshPool();
    await Promise.all([1, 2, 3].map(() => migrateDatabase(pool, signal)));
    await migrateDatabase(pool, signal);
    const { rows } = await pool.query<{ version: number }>(
      'SELECT version FROM scholarly.migrations ORDER BY version',
    );
    expect(rows.map(({ version }) => version)).toEqual(
      Array.from({ length: RUNTIME_SCHEMA_VERSION }, (_, i) => i + 1),
    );
    await expect(assertMigrated(pool, signal)).resolves.toBeUndefined();
  });

  it('refuses an unmigrated database with a clear error', async () => {
    const pool = await freshPool();
    await expect(assertMigrated(pool, signal)).rejects.toThrow(/run "ingest migrate"/);
  });
});
