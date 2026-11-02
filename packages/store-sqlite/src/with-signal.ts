/**
 * Runs synchronous SQLite work as an async port call: rejects when the caller has already
 * aborted, and turns a thrown error into a rejection. better-sqlite3 queries cannot be
 * interrupted once started, so the signal is checked before each one.
 */
export function withSignal<T>(signal: AbortSignal, work: () => T): Promise<T> {
  return new Promise((resolve) => {
    signal.throwIfAborted();
    resolve(work());
  });
}
