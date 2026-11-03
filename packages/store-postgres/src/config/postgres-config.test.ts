import { describe, expect, it } from 'vitest';
import { postgresConfigSchema } from './postgres-config.js';

describe('postgresConfigSchema', () => {
  it('takes a Postgres URL and fills defaults', () => {
    expect(
      postgresConfigSchema.parse({ DATABASE_URL: 'postgres://u:p@db:5432/scholarly' }),
    ).toEqual({
      DATABASE_URL: 'postgres://u:p@db:5432/scholarly',
      PG_POOL_MAX: 10,
      PG_STATEMENT_TIMEOUT_MS: 15_000,
    });
  });

  it('refuses other URLs and unsafe role names', () => {
    expect(postgresConfigSchema.safeParse({ DATABASE_URL: 'mysql://db/x' }).success).toBe(false);
    expect(
      postgresConfigSchema.safeParse({
        DATABASE_URL: 'postgresql://db/x',
        PG_SERVER_ROLE: 'x; DROP TABLE y',
      }).success,
    ).toBe(false);
  });
});
