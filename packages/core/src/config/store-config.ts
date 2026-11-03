import { z } from 'zod';

/**
 * `STORE` picks the store adapter of the server, the ingest and the eval (ADR 0034): SQLite
 * files by default, or Postgres at `DATABASE_URL`.
 */
export const storeConfigSchema = z.object({
  STORE: z.enum(['sqlite', 'postgres']).default('sqlite'),
});

export type StoreConfig = z.output<typeof storeConfigSchema>;
