import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../database/open-database.js';
import { createSearchWorkerState, type SearchWorkerRequest } from './search-worker-state.js';

/** The thread of one search worker (ADR 0041): its own read-only connection to the index. */
const port = parentPort;
if (port === null) throw new Error('The search worker must run in a worker thread');
const { indexPath } = workerData as { indexPath: string };
const state = createSearchWorkerState(() => openDatabase(indexPath, { readonly: true }));
port.on('message', (request: SearchWorkerRequest) => {
  void state.handle(request).then((reply) => {
    port.postMessage(reply);
  });
});
port.on('close', () => {
  state.close();
});
