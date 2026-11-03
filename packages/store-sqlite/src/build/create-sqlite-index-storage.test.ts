import { runIndexStorageContract } from '@scholarly-mcp/testkit';
import { afterEach } from 'vitest';
import { openIndexReader } from '../open-index-reader.js';
import { tempIndexPath } from '../testing/index-files.js';
import { createSqliteIndexStorage } from './create-sqlite-index-storage.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

runIndexStorageContract('SQLite index storage', () => {
  const { indexPath, cleanup } = tempIndexPath();
  cleanups.push(cleanup);
  return Promise.resolve({
    storage: createSqliteIndexStorage(indexPath),
    openReader: (modelVersion, signal) => openIndexReader(indexPath, modelVersion, signal),
  });
});
