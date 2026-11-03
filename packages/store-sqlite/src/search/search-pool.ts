import { Worker } from 'node:worker_threads';
import type { ArticleSearch, RankedChunk } from '@scholarly-mcp/core';
import type { SearchWorkerReply, SearchWorkerRequest } from './search-worker-state.js';

/**
 * The worker's compiled entry. Sources and output sit at the same depth (`src/search`,
 * `dist/search`), so this finds `dist` from both; tests therefore need a build first, which
 * `pnpm test` runs.
 */
const WORKER_URL = new URL('../../dist/search/search-worker.js', import.meta.url);

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Request = WithoutId<SearchWorkerRequest>;

interface Waiter {
  resolve(reply: SearchWorkerReply): void;
  reject(error: unknown): void;
}

interface Slot {
  worker: Worker;
  /** Replies awaited from this worker, by request id. */
  readonly waiting: Map<number, Waiter>;
  /** True while it runs a search; `reopen` messages do not count. */
  busy: boolean;
}

interface Queued {
  readonly request: Request;
  readonly waiter: Waiter;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
}

/** Searches on worker threads, and the controls the index reader needs around them. */
export interface SearchPool {
  readonly search: ArticleSearch;
  /** Has every worker open the index file again; resolves once all have. */
  reopen(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Runs lexical and vector searches on `size` worker threads, each with its own read-only
 * connection to `indexPath` (ADR 0041), so searches use more than one core and the event
 * loop stays free. A search waits in one queue for the next idle worker; one aborted while
 * waiting is dropped. A worker that crashes fails what it was running and is replaced.
 */
export function createSearchPool(indexPath: string, size: number): SearchPool {
  let nextId = 0;
  let closed = false;
  const queue: Queued[] = [];

  function spawn(): Slot {
    const slot: Slot = {
      worker: new Worker(WORKER_URL, { workerData: { indexPath } }),
      waiting: new Map(),
      busy: false,
    };
    slot.worker.on('message', (reply: SearchWorkerReply) => {
      const waiter = slot.waiting.get(reply.id);
      slot.waiting.delete(reply.id);
      waiter?.resolve(reply);
    });
    slot.worker.on('error', (error) => {
      fail(slot, error);
    });
    slot.worker.on('exit', (code) => {
      fail(slot, new Error(`A search worker exited with code ${String(code)}`));
    });
    return slot;
  }

  const slots = Array.from({ length: size }, spawn);

  function fail(slot: Slot, error: unknown): void {
    const index = slots.indexOf(slot);
    if (index === -1) return;
    for (const waiter of slot.waiting.values()) waiter.reject(error);
    slot.waiting.clear();
    if (closed) return;
    slots[index] = spawn();
    drain();
  }

  function send(slot: Slot, request: Request, waiter: Waiter): void {
    const id = (nextId += 1);
    slot.waiting.set(id, waiter);
    slot.worker.postMessage({ ...request, id });
  }

  function drain(): void {
    for (const slot of slots) {
      if (slot.busy) continue;
      const next = queue.shift();
      if (next === undefined) return;
      next.signal.removeEventListener('abort', next.onAbort);
      slot.busy = true;
      send(slot, next.request, {
        resolve(reply) {
          slot.busy = false;
          next.waiter.resolve(reply);
          drain();
        },
        reject(error) {
          slot.busy = false;
          next.waiter.reject(error);
        },
      });
    }
  }

  function run(request: Request, signal: AbortSignal): Promise<RankedChunk[]> {
    return new Promise<SearchWorkerReply>((resolve, reject) => {
      signal.throwIfAborted();
      if (closed) throw new Error('The search pool is closed');
      const queued: Queued = {
        request,
        waiter: { resolve, reject },
        signal,
        onAbort: () => {
          const index = queue.indexOf(queued);
          if (index !== -1) queue.splice(index, 1);
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        },
      };
      signal.addEventListener('abort', queued.onAbort, { once: true });
      queue.push(queued);
      drain();
    }).then(hitsOf);
  }

  return {
    search: {
      lexical: (query, signal) => run({ kind: 'lexical', query }, signal),
      vector: (query, signal) => run({ kind: 'vector', query }, signal),
    },
    async reopen() {
      const replies = await Promise.all(
        slots.map(
          (slot) =>
            new Promise<SearchWorkerReply>((resolve, reject) => {
              send(slot, { kind: 'reopen' }, { resolve, reject });
            }),
        ),
      );
      for (const reply of replies) hitsOf(reply);
    },
    async close() {
      closed = true;
      for (const { waiter, signal, onAbort } of queue.splice(0)) {
        signal.removeEventListener('abort', onAbort);
        waiter.reject(new Error('The search pool is closed'));
      }
      await Promise.all(slots.map((slot) => slot.worker.terminate()));
    },
  };
}

function hitsOf(reply: SearchWorkerReply): RankedChunk[] {
  if (!reply.ok) throw new Error(reply.message);
  return reply.hits ?? [];
}
