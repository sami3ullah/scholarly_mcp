import type { Embedder } from '@scholarly-mcp/core';

/** A query embedding and whether it came from the cache. */
export interface QueryEmbedding {
  readonly vector: Float32Array;
  readonly cached: boolean;
}

/** Embeds queries, remembering the most recent ones. */
export interface CachedQueryEmbedder {
  embed(text: string, signal: AbortSignal): Promise<QueryEmbedding>;
}

/**
 * Wraps an embedder's `embedQuery` in an LRU cache of `capacity` entries, since embedding is
 * the slowest step of a search and assistants repeat queries when paging or retrying. Keys
 * are SHA-256 digests, so no query text is held after its request ends. Only finished
 * embeddings are cached: an aborted or failed one is retried next time.
 */
export function createCachedQueryEmbedder(
  embedder: Pick<Embedder, 'embedQuery'>,
  capacity: number,
): CachedQueryEmbedder {
  const entries = new Map<string, Float32Array>();

  return {
    async embed(text, signal) {
      const key = await digest(text);
      const hit = entries.get(key);
      if (hit !== undefined) {
        entries.delete(key);
        entries.set(key, hit);
        return { vector: hit, cached: true };
      }
      const vector = await embedder.embedQuery(text, signal);
      if (capacity > 0) {
        entries.set(key, vector);
        const oldest = entries.keys().next().value;
        if (entries.size > capacity && oldest !== undefined) entries.delete(oldest);
      }
      return { vector, cached: false };
    },
  };
}

async function digest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
