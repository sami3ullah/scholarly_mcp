import { runUsageOutboxContract } from '@scholarly-mcp/testkit';
import { openRuntimeDatabase } from '../open-runtime-database.js';
import { createSqliteUsageOutbox } from './create-sqlite-usage-outbox.js';

runUsageOutboxContract('SQLite usage outbox', () =>
  createSqliteUsageOutbox(openRuntimeDatabase(':memory:')),
);
