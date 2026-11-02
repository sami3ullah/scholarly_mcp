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
