import {
  sampleQueryChecks,
  verifyResult as result,
  type Doi,
  type VerifyCheck,
  type VerifyOptions,
  type VerifyReport,
} from '@scholarly-mcp/core';
import { createPostgresIndexStore } from '../create-postgres-index-store.js';
import { INDEX_LAYOUT_VERSION, INDEX_NAMES, indexLayoutOf } from '../database/index-schema.js';
import { identifier, query, type Pool } from '../database/pool.js';

export type PostgresVerifyOptions = VerifyOptions;

const DEFAULT_SAMPLES = 5;

/**
 * Checks an index schema before it goes live, as the SQLite verify does a file: the layout
 * and its indexes, counts that agree, one model version, no unexpected shrink, and sample
 * queries that find articles by their own title words and chunks by their own vector.
 */
export async function verifyPostgresIndex(
  pool: Pool,
  schema: string,
  options: PostgresVerifyOptions,
  signal: AbortSignal,
): Promise<VerifyReport> {
  const s = identifier(schema);
  const count = async (sql: string, values: unknown[] = []) =>
    Number((await query<{ n: string }>(pool, signal, sql, values)).rows[0]?.n ?? 0);
  const layout = await indexLayoutOf(pool, schema);
  if (layout?.version !== INDEX_LAYOUT_VERSION) {
    const found = layout === undefined ? 'none' : String(layout.version);
    return {
      ok: false,
      articleCount: 0,
      chunkCount: 0,
      checks: [
        result('index layout', false, `found ${found}, expected ${String(INDEX_LAYOUT_VERSION)}`),
      ],
    };
  }
  const articleCount = await count(`SELECT count(*) AS n FROM ${s}.articles`);
  const chunkCount = await count(`SELECT count(*) AS n FROM ${s}.chunks`);
  const models = (
    await query<{ model_version: string }>(
      pool,
      signal,
      `SELECT DISTINCT model_version FROM ${s}.chunks`,
    )
  ).rows.map(({ model_version }) => model_version);
  const presentIndexes = await count(
    'SELECT count(*) AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = ANY($2)',
    [schema, INDEX_NAMES],
  );
  const checks: VerifyCheck[] = [
    result('index layout', true, `version ${String(layout.version)}`),
    result(
      'search indexes',
      presentIndexes === INDEX_NAMES.length,
      `${String(presentIndexes)} of ${String(INDEX_NAMES.length)}`,
    ),
    result('not empty', articleCount > 0, `${String(articleCount)} articles`),
    result(
      'every article has chunks',
      (await count(
        `SELECT count(*) AS n FROM ${s}.articles a
         WHERE NOT EXISTS (SELECT 1 FROM ${s}.chunks c WHERE c.doi = a.doi)`,
      )) === 0,
      'articles without chunks would be unfindable',
    ),
    result(
      'one model version',
      models.length === 0 || (models.length === 1 && models[0] === options.modelVersion),
      `found ${models.join(', ') || 'none'}, expected ${options.modelVersion}`,
    ),
    result(
      'no unexpected shrink',
      articleCount >= (options.minArticleCount ?? 0),
      `${String(articleCount)} articles, at least ${String(options.minArticleCount ?? 0)} expected`,
    ),
    ...(await sampleQueries(pool, schema, options.samples ?? DEFAULT_SAMPLES, signal)),
  ];
  return { ok: checks.every((item) => item.ok), articleCount, chunkCount, checks };
}

async function sampleQueries(
  pool: Pool,
  schema: string,
  samples: number,
  signal: AbortSignal,
): Promise<VerifyCheck[]> {
  const { rows } = await query<{ doi: Doi }>(
    pool,
    signal,
    `SELECT doi FROM (SELECT doi, row_number() OVER (ORDER BY doi) AS n,
       count(*) OVER () AS total FROM ${identifier(schema)}.articles) numbered
     WHERE (n - 1) % greatest(1, total / $1) = 0 LIMIT $1`,
    [samples],
  );
  return sampleQueryChecks(
    createPostgresIndexStore(pool, schema),
    rows.map(({ doi }) => doi),
    signal,
  );
}
