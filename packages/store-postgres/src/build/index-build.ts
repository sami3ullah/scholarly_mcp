import { randomBytes } from 'node:crypto';
import { appError, type IndexMeta } from '@scholarly-mcp/core';
import {
  createPostgresIndexStore,
  type PostgresIndexStore,
} from '../create-postgres-index-store.js';
import {
  INDEX_LAYOUT_VERSION,
  assertIndexLayout,
  createIndexSchema,
} from '../database/index-schema.js';
import { writeIndexMeta } from '../database/index-meta-row.js';
import { identifier, inTransaction, type Pool, type PoolClient } from '../database/pool.js';
import { readLiveIndex } from './live-index.js';

/**
 * A full run starts from an empty schema; an incremental run and a purge (removing full
 * text by licence) from a copy of the live one.
 */
export type BuildKind = 'full' | 'incremental' | 'purge';

/** An index being built in its own schema, made live only after it is verified. */
export interface PostgresIndexBuild {
  readonly kind: BuildKind;
  /** True when an interrupted build of the same kind was picked up again. */
  readonly resumed: boolean;
  /** The build's schema, `index_<build id>`. */
  readonly schema: string;
  readonly store: PostgresIndexStore;
  /**
   * Records `meta`, grants the server role read access and points `live_index` at this
   * build, in one transaction. The schema before the previous one is dropped then.
   */
  commit(meta: IndexMeta, signal: AbortSignal): Promise<void>;
  /** Drops the build, e.g. when it failed verification, so the next run starts over. */
  discard(signal: AbortSignal): Promise<void>;
}

/** Arbitrary, fixed key of the advisory lock that serialises starting and ending builds. */
const BUILD_LOCK = 7_340_014;

/**
 * Starts or resumes a build (ADR 0034). A leftover build of the same kind, layout and vector
 * size is resumed, so its checkpoint and its rows carry on together; any other leftover is
 * dropped. An incremental or purge build copies the live schema inside the database. Needs
 * the writer role and a migrated database.
 */
export async function beginPostgresIndexBuild(
  options: {
    readonly pool: Pool;
    readonly kind: BuildKind;
    readonly now: Date;
    /** The embedding model's vector size; a full build creates its schema for it (ADR 0028). */
    readonly dimensions: number;
    /** The server's role, granted read access to the build when it is committed. */
    readonly serverRole?: string;
  },
  signal: AbortSignal,
): Promise<PostgresIndexBuild> {
  const { pool, kind, now, dimensions } = options;
  const started = await inTransaction(pool, signal, async (client) => {
    await lockBuilds(client);
    const leftover = await client.query<{
      schema_name: string;
      kind: BuildKind;
      layout: number;
      dimensions: number;
    }>('SELECT schema_name, kind, layout, dimensions FROM scholarly.index_build WHERE id = 1');
    const row = leftover.rows[0];
    if (
      row !== undefined &&
      row.kind === kind &&
      row.layout === INDEX_LAYOUT_VERSION &&
      row.dimensions === dimensions
    ) {
      return { schema: row.schema_name, resumed: true };
    }
    if (row !== undefined) await dropBuild(client, row.schema_name);

    const schema = buildSchemaName(now);
    if (kind === 'full') {
      await createIndexSchema(client, schema, { dimensions });
    } else {
      const live = await readLiveIndex(client);
      if (live === undefined) {
        throw appError('INDEX_UNAVAILABLE', 'No index to update yet; run a full build first');
      }
      await assertIndexLayout(client, live.schema, dimensions);
      await createIndexSchema(client, schema, { dimensions, copyFrom: live.schema });
    }
    await client.query(
      `INSERT INTO scholarly.index_build (id, schema_name, kind, layout, dimensions, started_at)
       VALUES (1, $1, $2, $3, $4, $5)`,
      [schema, kind, INDEX_LAYOUT_VERSION, dimensions, now],
    );
    return { schema, resumed: false };
  });

  const { schema } = started;
  return {
    kind,
    resumed: started.resumed,
    schema,
    store: createPostgresIndexStore(pool, schema),
    async commit(meta, commitSignal) {
      await inTransaction(pool, commitSignal, async (client) => {
        await lockBuilds(client);
        await client.query(`ANALYZE ${identifier(schema)}.chunks, ${identifier(schema)}.articles`);
        await writeIndexMeta(client, identifier(schema), meta);
        if (options.serverRole !== undefined) {
          const role = identifier(options.serverRole);
          await client.query(`GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${role}`);
          await client.query(
            `GRANT SELECT ON ALL TABLES IN SCHEMA ${identifier(schema)} TO ${role}`,
          );
        }
        const live = await readLiveIndex(client, { forUpdate: true });
        await client.query(
          `INSERT INTO scholarly.live_index (id, schema_name, version, previous_schema, switched_at)
           VALUES (1, $1, $2, $3, now())
           ON CONFLICT (id) DO UPDATE SET schema_name = excluded.schema_name,
             version = excluded.version, previous_schema = excluded.previous_schema,
             switched_at = excluded.switched_at`,
          [schema, meta.version, live?.schema ?? null],
        );
        // A query still running on the previous index finishes; the one before goes now.
        if (live?.previousSchema !== undefined && live.previousSchema !== schema) {
          await client.query(`DROP SCHEMA IF EXISTS ${identifier(live.previousSchema)} CASCADE`);
        }
        await client.query('DELETE FROM scholarly.index_build WHERE schema_name = $1', [schema]);
      });
    },
    async discard(discardSignal) {
      await inTransaction(pool, discardSignal, async (client) => {
        await lockBuilds(client);
        await dropBuild(client, schema);
      });
    },
  };
}

/** Builds copy and index the whole corpus, so they run without the statement timeout. */
async function lockBuilds(client: PoolClient): Promise<void> {
  await client.query("SET LOCAL statement_timeout = '0'");
  await client.query('SELECT pg_advisory_xact_lock($1)', [BUILD_LOCK]);
}

async function dropBuild(client: PoolClient, schema: string): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);
  await client.query('DELETE FROM scholarly.index_build WHERE schema_name = $1', [schema]);
}

/** `index_<UTC time>_<random>`: sortable by start, unique even for builds in one second. */
function buildSchemaName(now: Date): string {
  const stamp = now
    .toISOString()
    .replaceAll(/[-:]|\.\d+/g, '')
    .toLowerCase();
  return `index_${stamp}_${randomBytes(3).toString('hex')}`;
}
