import type { Doi } from '../article/doi.js';
import type { ArticleReader } from '../ports/article-reader.js';
import type { ArticleSearch } from '../ports/article-search.js';

/** One named check of a verify run, with what it found. */
export interface VerifyCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** What `ingest verify` prints; an index is swapped in only when `ok` is true. */
export interface VerifyReport {
  readonly ok: boolean;
  readonly articleCount: number;
  readonly chunkCount: number;
  readonly checks: readonly VerifyCheck[];
}

/** How deep in the results a sampled article must appear for the sample queries to pass. */
const SAMPLE_DEPTH = 10;

export function verifyResult(name: string, ok: boolean, detail: string): VerifyCheck {
  return { name, ok, detail };
}

/**
 * The sample queries every store's verify runs (PLAN.md "Crash halfway through a run"): each
 * sampled article must be found by its own title words, and its first chunk by its own
 * vector, within the first {@link SAMPLE_DEPTH} hits.
 */
export async function sampleQueryChecks(
  index: { readonly reader: ArticleReader; readonly search: ArticleSearch },
  dois: readonly Doi[],
  signal: AbortSignal,
): Promise<VerifyCheck[]> {
  const filters = { includeRetracted: true };
  const checks: VerifyCheck[] = [];
  for (const doi of dois) {
    const article = await index.reader.findByDoi(doi, signal);
    const chunk = (await index.reader.findArticleChunks(doi, signal))[0];
    if (article === undefined || chunk === undefined) continue;
    const terms = article.title.split(/\s+/);
    const lexical = await index.search.lexical({ terms, filters, limit: SAMPLE_DEPTH }, signal);
    const vector = await index.search.vector(
      { embedding: chunk.embedding, filters, limit: SAMPLE_DEPTH },
      signal,
    );
    checks.push(
      verifyResult(
        `title finds ${doi}`,
        lexical.some((hit) => hit.doi === doi),
        'lexical sample',
      ),
      verifyResult(
        `vector finds ${chunk.id}`,
        vector.some((hit) => hit.chunkId === chunk.id),
        'vector sample',
      ),
    );
  }
  return checks;
}
