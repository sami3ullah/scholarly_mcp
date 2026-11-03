import { runIndexStorageContract } from '@scholarly-mcp/testkit';
import { migrateDatabase } from '../database/runtime-schema.js';
import { openPostgresIndexReader } from '../open-postgres-index-reader.js';
import { freshPool } from '../testing/fresh-database.js';
import { createPostgresIndexStorage } from './create-postgres-index-storage.js';

runIndexStorageContract('Postgres index storage', async () => {
  const pool = await freshPool();
  await migrateDatabase(pool, new AbortController().signal);
  return {
    storage: createPostgresIndexStorage({ pool }),
    openReader: (modelVersion, signal) => openPostgresIndexReader(pool, modelVersion, signal),
  };
});
