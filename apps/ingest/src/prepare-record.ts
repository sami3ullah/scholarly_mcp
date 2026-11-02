import {
  articleSections,
  chunkDocument,
  chunkSchema,
  chunkSourceSchema,
  withoutFullText,
  type Article,
  type ArticleEnricher,
  type ArticleRecord,
  type ChunkSection,
  type ChunkSource,
  type Doi,
  type Embedder,
  type FullTextSection,
} from '@scholarly-mcp/core';

/** Where a rebuild can find already-embedded records, e.g. the live index during a full run. */
export interface RecordLookup {
  findRecord(doi: Doi, signal: AbortSignal): Promise<ArticleRecord | undefined>;
}

/** What {@link prepareRecord} needs. */
export interface PrepareDeps {
  readonly embedder: Embedder;
  readonly chunkSource: ChunkSource;
  /** True when the index being built already holds this exact content. */
  readonly isStored: (article: Article, signal: AbortSignal) => Promise<boolean>;
  readonly previous?: RecordLookup;
  /** Fetches the full text an article references; absent when enrichment is off. */
  readonly enricher?: ArticleEnricher;
}

/**
 * How an article came to be ready, or not needed. `fullTextSkipped` marks an article whose
 * referenced full text proved unusable, so it was prepared from its metadata.
 */
export type Prepared = (
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'reused'; readonly record: ArticleRecord }
  | { readonly kind: 'embedded'; readonly record: ArticleRecord }
) & { readonly fullTextSkipped: boolean };

/**
 * Turns an article into a record ready to upsert (PLAN.md "Phase 2"). It is skipped when the
 * index already holds the same content, and reuses the chunks of `previous` when they hold
 * the same content embedded by the same model, so a full rebuild neither re-embeds the
 * corpus nor fetches full text again. Otherwise the referenced full text is fetched; when it
 * is missing or unusable the reference is dropped and both checks run again, so an article
 * whose text never arrives is not re-indexed on every run. Then it is chunked and embedded,
 * full-text sections as matching-only chunks under the reference's licence (ADR 0003).
 */
export async function prepareRecord(
  article: Article,
  deps: PrepareDeps,
  signal: AbortSignal,
): Promise<Prepared> {
  const known = await settledAs(article, deps, signal);
  if (known !== undefined) return { ...known, fullTextSkipped: false };

  let indexed = article;
  let fullText: readonly FullTextSection[] | undefined;
  if (article.fullText !== undefined && deps.enricher !== undefined) {
    fullText = await deps.enricher.fetchFullText(article.doi, article.fullText, signal);
    if (fullText === undefined) {
      indexed = await withoutFullText(article);
      const fallback = await settledAs(indexed, deps, signal);
      if (fallback !== undefined) return { ...fallback, fullTextSkipped: true };
    }
  }

  const record = await embedRecord(indexed, fullText, deps, signal);
  return { kind: 'embedded', record, fullTextSkipped: indexed !== article };
}

/** `unchanged` or `reused` when no new work is needed for this content, else undefined. */
async function settledAs(
  article: Article,
  deps: PrepareDeps,
  signal: AbortSignal,
): Promise<
  { readonly kind: 'unchanged' } | { readonly kind: 'reused'; record: ArticleRecord } | undefined
> {
  if (await deps.isStored(article, signal)) return { kind: 'unchanged' };
  const known = await deps.previous?.findRecord(article.doi, signal);
  if (
    known !== undefined &&
    known.article.contentHash === article.contentHash &&
    known.chunks.length > 0 &&
    known.chunks.every((chunk) => chunk.modelVersion === deps.embedder.modelVersion)
  ) {
    return { kind: 'reused', record: { article, chunks: known.chunks } };
  }
  return undefined;
}

async function embedRecord(
  article: Article,
  fullText: readonly FullTextSection[] | undefined,
  deps: PrepareDeps,
  signal: AbortSignal,
): Promise<ArticleRecord> {
  const { embedder } = deps;
  const drafts = chunkDocument(
    {
      doi: article.doi,
      title: article.title,
      ...(article.language !== undefined && { language: article.language }),
      sections: [
        ...articleSections(article, deps.chunkSource),
        ...fullTextSections(article, fullText, deps.enricher),
      ],
    },
    { countTokens: embedder.countTokens },
  );
  const vectors = await embedder.embedPassages(
    drafts.map((draft) => draft.embeddingText),
    signal,
  );
  const chunks = drafts.map((draft, i) => {
    const embedding = vectors[i];
    if (embedding === undefined) throw new Error(`The embedder returned no vector for ${draft.id}`);
    // Parsing drops the draft-only fields, and an embedder with the wrong vector size fails
    // here rather than in the store.
    return chunkSchema.parse({ ...draft, embedding, modelVersion: embedder.modelVersion });
  });
  return { article, chunks };
}

/**
 * Full-text sections as chunker input. Origin, source and licence come from the article's
 * reference and the enricher, never from the adapter's sections, so a chunk cannot be
 * mislabelled as displayable or lose its licence.
 */
function fullTextSections(
  article: Article,
  sections: readonly FullTextSection[] | undefined,
  enricher: ArticleEnricher | undefined,
): ChunkSection[] {
  const ref = article.fullText;
  if (sections === undefined || ref === undefined || enricher === undefined) return [];
  const source = chunkSourceSchema.parse(enricher.name);
  return sections.map(({ label, paragraphs }) => ({
    ...(label !== undefined && { label }),
    paragraphs,
    origin: 'fulltext',
    source,
    licenseUrl: ref.licenseUrl,
  }));
}
