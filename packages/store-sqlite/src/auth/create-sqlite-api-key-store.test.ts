import { runApiKeyStoreContract } from '@scholarly-mcp/testkit';
import { openRuntimeDatabase } from '../open-runtime-database.js';
import { createSqliteApiKeyStore } from './create-sqlite-api-key-store.js';

runApiKeyStoreContract('SQLite API key store', () =>
  createSqliteApiKeyStore(openRuntimeDatabase(':memory:')),
);
