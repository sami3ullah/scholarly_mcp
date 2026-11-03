import pg from 'pg';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
/** A pool or a client inside a transaction; both run queries. */
export type Queryable = Pool | PoolClient;

/** Opens a connection pool. Nothing connects until the first query. */
export function createPool(options: {
  readonly url: string;
  readonly max: number;
  readonly statementTimeoutMs: number;
  readonly applicationName: string;
}): Pool {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.max,
    statement_timeout: options.statementTimeoutMs,
    application_name: options.applicationName,
  });
  // An idle client that loses its connection must not crash the process; the next query
  // gets a fresh one.
  pool.on('error', () => undefined);
  return pool;
}

/**
 * Runs one parameterised query as a port call: rejects when the caller has already aborted.
 * Values are always bound, never spliced into the SQL text.
 */
export async function query<Row extends pg.QueryResultRow>(
  db: Queryable,
  signal: AbortSignal,
  text: string,
  values: readonly unknown[] = [],
): Promise<pg.QueryResult<Row>> {
  signal.throwIfAborted();
  return db.query<Row>(text, values as unknown[]);
}

/** Runs `work` in one transaction on one client, rolling back when it throws. */
export async function inTransaction<T>(
  pool: Pool,
  signal: AbortSignal,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Quotes an SQL identifier built from trusted parts, such as a build's schema name. */
export function identifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new RangeError(`Bad identifier ${name}`);
  return `"${name}"`;
}
