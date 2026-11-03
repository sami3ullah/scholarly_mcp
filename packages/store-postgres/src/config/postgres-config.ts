import { z } from 'zod';

/**
 * Postgres store settings (ADR 0014, ADR 0034). `DATABASE_URL` names the role too: the
 * ingest and the keys command connect as the writer, the server as its read-mostly role.
 * `PG_SERVER_ROLE`, when set, is the role the ingest grants read access to each committed
 * build and the runtime tables.
 */
export const postgresConfigSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(15_000),
  PG_SERVER_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]{0,62}$/)
    .optional(),
});

export type PostgresConfig = z.output<typeof postgresConfigSchema>;
