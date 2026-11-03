export { sqliteConfigSchema, type SqliteConfig } from './config/sqlite-config.js';
export {
  beginIndexBuild,
  buildPathOf,
  type BuildKind,
  type IndexBuild,
} from './build/index-build.js';
export {
  verifyIndex,
  type VerifyCheck,
  type VerifyOptions,
  type VerifyReport,
} from './build/verify-index.js';
export type { PurgeCounts } from '@scholarly-mcp/core';
export { createSqliteIndexStorage } from './build/create-sqlite-index-storage.js';
export { createSqliteIndexStore, type SqliteIndexStore } from './create-sqlite-index-store.js';
export {
  INDEX_SCHEMA_VERSION,
  createIndexSchema,
  embeddingDimensionsOf,
  indexSchemaVersion,
} from './database/index-schema.js';
export { openDatabase, type Db } from './database/open-database.js';
export { openIndexReader, type IndexReader } from './open-index-reader.js';
export { openRuntimeDatabase } from './open-runtime-database.js';
export { createSqliteSessionStore } from './sessions/create-sqlite-session-store.js';
export { createSqliteApiKeyStore } from './auth/create-sqlite-api-key-store.js';
export { createSqliteUsageOutbox } from './metering/create-sqlite-usage-outbox.js';
