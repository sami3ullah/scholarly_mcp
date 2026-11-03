import type { Queryable } from '../database/pool.js';

/** The index schema the server reads, and the one before it, kept until the next swap. */
export interface LiveIndex {
  readonly schema: string;
  readonly version: string;
  readonly previousSchema?: string;
}

/** Reads the `scholarly.live_index` pointer; undefined before the first commit. */
export async function readLiveIndex(
  db: Queryable,
  options: { readonly forUpdate?: boolean } = {},
): Promise<LiveIndex | undefined> {
  const { rows } = await db.query<{
    schema_name: string;
    version: string;
    previous_schema: string | null;
  }>(
    `SELECT schema_name, version, previous_schema FROM scholarly.live_index WHERE id = 1
     ${options.forUpdate === true ? 'FOR UPDATE' : ''}`,
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    schema: row.schema_name,
    version: row.version,
    ...(row.previous_schema !== null && { previousSchema: row.previous_schema }),
  };
}
