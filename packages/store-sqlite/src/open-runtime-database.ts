import { migrateRuntimeDatabase } from './database/runtime-schema.js';
import { openDatabase, type Db } from './database/open-database.js';

/**
 * Opens (creating if needed) the runtime database in WAL mode and migrates it, so several
 * server processes can share it.
 */
export function openRuntimeDatabase(path: string): Db {
  const db = openDatabase(path, { wal: true });
  migrateRuntimeDatabase(db);
  return db;
}
