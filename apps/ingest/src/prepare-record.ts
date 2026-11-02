import {
  articleSections,
  chunkDocument,
  chunkSchema,
  type Article,
  type ArticleRecord,
  type ChunkSource,
  type Doi,
  type Embedder,
} from '@scholarly-mcp/core';

/** Where a rebuild can find already-embedded records, e.g. the live index during a full run. */
export interface RecordLookup {
  findRecord(doi: Doi, signal: AbortSignal): Promise<ArticleRecord | undefined>;
}

/** How a record came to be ready for writing. */
export type Prepared =
  | { readonly kind: 'reused'; readonly record: ArticleRecord }
  | { readonly kind: 'embedded'; readonly record: ArticleRecord };

/**
 * Turns an article into a record ready to upsert: chunks it and embeds the chunks, or, when
 * `previous` holds the same content embedded by the same model, reuses those chunks so a
 * full rebuild does not re-embed the whole corpus.
 */
export async function prepareRecord(
  article: Article,
  deps: {
    readonly embedder: Embedder;
    readonly chunkSource: ChunkSource;
    readonly previous?: RecordLookup;
  },
  signal: AbortSignal,
): Promise<Prepared> {
  const { embedder } = deps;
  const known = await deps.previous?.findRecord(article.doi, signal);
  if (
    known !== undefined &&
    known.article.contentHash === article.contentHash &&
    known.chunks.length > 0 &&
    known.chunks.every((chunk) => chunk.modelVersion === embedder.modelVersion)
  ) {
    return { kind: 'reused', record: { article, chunks: known.chunks } };
  }

  const drafts = chunkDocument(
    {
      doi: article.doi,
      title: article.title,
      ...(article.language !== undefined && { language: article.language }),
      sections: articleSections(article, deps.chunkSource),
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
  return { kind: 'embedded', record: { article, chunks } };
}
