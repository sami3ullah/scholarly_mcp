/**
 * Runs `work` as a real async adapter would: rejects when the caller already aborted, and
 * turns a thrown error into a rejection instead of a synchronous throw.
 */
export function settle<T>(signal: AbortSignal, work: () => T): Promise<T> {
  return new Promise((resolve) => {
    signal.throwIfAborted();
    resolve(work());
  });
}
