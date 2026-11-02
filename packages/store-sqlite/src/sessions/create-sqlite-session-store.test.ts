import { runSessionStoreContract } from '@scholarly-mcp/testkit';
import { openRuntimeDatabase } from '../open-runtime-database.js';
import { createSqliteSessionStore } from './create-sqlite-session-store.js';

runSessionStoreContract('SQLite session store', () =>
  createSqliteSessionStore(openRuntimeDatabase(':memory:')),
);
