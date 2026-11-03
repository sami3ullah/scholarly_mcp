import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, inject } from 'vitest';
import { createPool, type Pool } from '../database/pool.js';

const opened: Pool[] = [];

afterAll(async () => {
  await Promise.all(opened.splice(0).map((pool) => pool.end()));
});

/** The connection string of a new, empty database on the test container. */
export async function freshDatabaseUrl(): Promise<string> {
  const admin = inject('postgresAdminUrl');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${name}`);
  } finally {
    await client.end();
  }
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return url.toString();
}

/** A pool on a new, empty database, closed after the test file. */
export async function freshPool(): Promise<Pool> {
  const pool = createPool({
    url: await freshDatabaseUrl(),
    max: 4,
    statementTimeoutMs: 30_000,
    applicationName: 'store-postgres-test',
  });
  opened.push(pool);
  return pool;
}
