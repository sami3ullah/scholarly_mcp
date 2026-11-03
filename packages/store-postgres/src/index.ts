export { postgresConfigSchema, type PostgresConfig } from './config/postgres-config.js';
export { createPool, type Pool } from './database/pool.js';
export {
  RUNTIME_SCHEMA_VERSION,
  assertMigrated,
  grantServerRole,
  migrateDatabase,
} from './database/runtime-schema.js';
export { INDEX_LAYOUT_VERSION } from './database/index-schema.js';
export {
  createPostgresIndexStore,
  type PostgresIndexStore,
} from './create-postgres-index-store.js';
export type { PurgeCounts } from '@scholarly-mcp/core';
export { createPostgresIndexStorage } from './build/create-postgres-index-storage.js';
export { openPostgresIndexReader } from './open-postgres-index-reader.js';
export {
  beginPostgresIndexBuild,
  type BuildKind,
  type PostgresIndexBuild,
} from './build/index-build.js';
export { readLiveIndex, type LiveIndex } from './build/live-index.js';
export { verifyPostgresIndex, type PostgresVerifyOptions } from './build/verify-index.js';
export { createPostgresApiKeyStore } from './auth/create-postgres-api-key-store.js';
export { createPostgresBucketStore } from './limits/create-postgres-bucket-store.js';
export { createPostgresSessionStore } from './sessions/create-postgres-session-store.js';
export { createPostgresUsageOutbox } from './metering/create-postgres-usage-outbox.js';
