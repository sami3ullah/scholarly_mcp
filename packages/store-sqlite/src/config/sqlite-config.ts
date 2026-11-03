import { z } from 'zod';

/**
 * SQLite store settings (ADR 0014). `INDEX_PATH` is the index file the ingest builds and the
 * server reads; builds are written to `<INDEX_PATH>.building` first, so it must be on the
 * same file system for the swap to be atomic. `RUNTIME_DB_PATH` holds landing sessions and
 * the metering outbox, which outlive index swaps. `SQLITE_SEARCH_WORKERS` threads run the
 * server's searches, each on its own connection (ADR 0041): about one per CPU the server
 * may use; 0 runs them on the event loop.
 */
export const sqliteConfigSchema = z.object({
  INDEX_PATH: z.string().min(1).default('data/index.sqlite'),
  RUNTIME_DB_PATH: z.string().min(1).default('data/runtime.sqlite'),
  SQLITE_SEARCH_WORKERS: z.coerce.number().int().min(0).max(64).default(2),
});

export type SqliteConfig = z.output<typeof sqliteConfigSchema>;
