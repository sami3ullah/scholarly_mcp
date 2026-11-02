/** Limits how many tasks run at once; waiting callers queue in order. */
export interface Semaphore {
  /** Runs `task` once a slot is free. Rejects without running it if `signal` aborts first. */
  run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T>;
}

interface Waiter {
  readonly start: () => void;
}

/**
 * Creates a semaphore with `limit` slots. Embedding is CPU-bound, so bursts must queue
 * instead of starving the server (PLAN.md "Failure modes"); callers bound the wait with
 * their signal, e.g. `AbortSignal.timeout`.
 */
export function createSemaphore(limit: number): Semaphore {
  let running = 0;
  const queue: Waiter[] = [];

  function release(): void {
    running -= 1;
    queue.shift()?.start();
  }

  function acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (running < limit) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        start: () => {
          signal.removeEventListener('abort', onAbort);
          running += 1;
          resolve();
        },
      };
      function onAbort(): void {
        queue.splice(queue.indexOf(waiter), 1);
        reject(signal.reason as Error);
      }
      signal.addEventListener('abort', onAbort, { once: true });
      queue.push(waiter);
    });
  }

  return {
    async run(task, signal) {
      await acquire(signal);
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
