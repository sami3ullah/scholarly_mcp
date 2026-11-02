import { EMBEDDING_DIMENSIONS, chunkSchema, type Chunk } from '@scholarly-mcp/core';

/** A fluent, immutable builder for valid chunks. Every method returns a new builder. */
export interface ChunkBuilder {
  /** Sets the DOI and ordinal together, which also sets the id to `<doi>#<ordinal>`. */
  of(doi: string, ordinal?: number): ChunkBuilder;
  withText(text: string): ChunkBuilder;
  inSection(section: string): ChunkBuilder;
  withLanguage(language: string): ChunkBuilder;
  /** Sets the leading embedding values; the rest are zero. */
  withEmbedding(...values: number[]): ChunkBuilder;
  withModelVersion(modelVersion: string): ChunkBuilder;
  /** Marks the chunk as matching-only full text under the given licence (ADR 0003). */
  fromFullText(licenseUrl: string): ChunkBuilder;
  build(): Chunk;
}

const DEFAULTS = {
  doi: '10.1055/a-0000-0001',
  ordinal: 0,
  section: 'Abstract',
  text: 'Lower doses of rivaroxaban were not inferior in preventing stroke.',
  language: 'en',
  origin: 'abstract',
  source: 'crossref',
  embedding: [1],
  modelVersion: 'multilingual-e5-small@test',
};

type Draft = Record<string, unknown> & { doi: string; ordinal: number; embedding: number[] };

/** Starts a builder for an English abstract chunk of the default test article. */
export function aChunk(draft: Draft = DEFAULTS): ChunkBuilder {
  const next = (changes: Partial<Draft>): ChunkBuilder => aChunk({ ...draft, ...changes });
  return {
    of: (doi, ordinal = 0) => next({ doi, ordinal }),
    withText: (text) => next({ text }),
    inSection: (section) => next({ section }),
    withLanguage: (language) => next({ language }),
    withEmbedding: (...embedding) => next({ embedding }),
    withModelVersion: (modelVersion) => next({ modelVersion }),
    fromFullText: (licenseUrl) => next({ origin: 'fulltext', source: 'europepmc', licenseUrl }),
    build: () => {
      const embedding = new Float32Array(EMBEDDING_DIMENSIONS);
      embedding.set(draft.embedding);
      const text = typeof draft['text'] === 'string' ? draft['text'] : '';
      return chunkSchema.parse({
        ...draft,
        id: `${draft.doi}#${String(draft.ordinal)}`,
        tokenCount: Math.max(1, text.split(/\s+/).length),
        embedding,
      });
    },
  };
}
