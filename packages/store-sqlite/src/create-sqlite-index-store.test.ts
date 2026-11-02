import { runArticleStoreContract, runSyncStateStoreContract } from '@scholarly-mcp/testkit';
import { createSqliteIndexStore } from './create-sqlite-index-store.js';
import { createIndexSchema } from './database/index-schema.js';
import { openDatabase } from './database/open-database.js';

function freshStore() {
  const db = openDatabase(':memory:');
  createIndexSchema(db);
  return createSqliteIndexStore(db);
}

runArticleStoreContract('SQLite index store', freshStore);
runSyncStateStoreContract('SQLite sync state store', () => freshStore().syncState);
