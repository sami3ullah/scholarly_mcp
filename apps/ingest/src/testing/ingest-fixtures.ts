import type { Article, Embedder, SyncState, SyncStateStore } from '@scholarly-mcp/core';
import { anArticle, createFakeEmbedder } from '@scholarly-mcp/testkit';

/** Article `n`, with a content hash that changes with `revision`. */
export function article(n: number, revision = 0): Article {
  const hex = (n * 1000 + revision).toString(16);
  return anArticle()
    .withDoi(`10.1055/a-${String(n)}`)
    .withTitle(`Anticoagulation study ${String(n)} revision ${String(revision)}`)
    .withContentHash(hex.padStart(64, '0'))
    .updatedAt(new Date('2026-11-02T09:00:00Z'))
    .build();
}

/** A fake embedder that counts how many passages it embedded. */
export function countingEmbedder(): Embedder & { readonly calls: () => number } {
  const inner = createFakeEmbedder();
  let calls = 0;
  return {
    ...inner,
    embedPassages: (texts, signal) => {
      calls += texts.length;
      return inner.embedPassages(texts, signal);
    },
    calls: () => calls,
  };
}

/**
 * A second model with its own version and vector size, to test model changes. It records
 * the texts it embedded; `onEmbed` runs after each call.
 */
export function otherModelEmbedder(options: { readonly onEmbed?: () => void } = {}): Embedder & {
  readonly texts: () => readonly string[];
} {
  const dimensions = 8;
  const texts: string[] = [];
  const vector = (text: string) => {
    const values = new Float32Array(dimensions);
    values[text.length % dimensions] = 1;
    return values;
  };
  const inner = createFakeEmbedder();
  return {
    modelVersion: 'other-model@1',
    dimensions,
    countTokens: inner.countTokens,
    embedPassages: (passages, signal) => {
      signal.throwIfAborted();
      texts.push(...passages);
      options.onEmbed?.();
      return Promise.resolve(passages.map(vector));
    },
    embedQuery: (text, signal) => {
      signal.throwIfAborted();
      return Promise.resolve(vector(text));
    },
    texts: () => texts,
  };
}

/** Wraps a sync state store and keeps every saved checkpoint. */
export function recordingSyncState(store: SyncStateStore): SyncStateStore & {
  readonly saved: SyncState[];
} {
  const saved: SyncState[] = [];
  return {
    load: (source, signal) => store.load(source, signal),
    save: async (state, signal) => {
      saved.push(state);
      await store.save(state, signal);
    },
    saved,
  };
}
