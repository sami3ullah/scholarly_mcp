/** A map that forgets entries after `ttlMs` and drops the oldest beyond `maxEntries`. */
export interface BoundedCache<V> {
  get(key: string, now: number): V | undefined;
  set(key: string, value: V, now: number): void;
}

/** Creates a small TTL cache; with `ttlMs` 0 it never holds anything. */
export function createBoundedCache<V>(ttlMs: number, maxEntries = 10_000): BoundedCache<V> {
  const entries = new Map<string, { value: V; expires: number }>();
  return {
    get: (key, now) => {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (entry.expires > now) return entry.value;
      entries.delete(key);
      return undefined;
    },
    set: (key, value, now) => {
      if (ttlMs <= 0) return;
      entries.delete(key);
      entries.set(key, { value, expires: now + ttlMs });
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done !== true) entries.delete(oldest.value);
      }
    },
  };
}
