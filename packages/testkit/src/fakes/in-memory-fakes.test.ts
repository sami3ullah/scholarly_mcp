import { runArticleStoreContract } from '../contracts/article-store-contract.js';
import { runEmbedderContract } from '../contracts/embedder-contract.js';
import { runSessionStoreContract } from '../contracts/session-store-contract.js';
import { runSourceContract } from '../contracts/source-contract.js';
import { runSyncStateStoreContract } from '../contracts/sync-state-store-contract.js';
import { anArticle } from '../builders/an-article.js';
import { createFakeEmbedder } from './fake-embedder.js';
import { createInMemoryArticleStore } from './in-memory-article-store.js';
import { createInMemorySessionStore } from './in-memory-session-store.js';
import { createInMemorySource } from './in-memory-source.js';
import { createInMemorySyncStateStore } from './in-memory-sync-state-store.js';

runArticleStoreContract('in-memory article store', () => {
  const store = createInMemoryArticleStore();
  return { reader: store, writer: store, search: store };
});

runSessionStoreContract('in-memory session store', createInMemorySessionStore);

runEmbedderContract('fake embedder', { create: createFakeEmbedder });

runSyncStateStoreContract('in-memory sync state store', createInMemorySyncStateStore);

runSourceContract('in-memory source', {
  create: () =>
    createInMemorySource({
      articles: [1, 2, 3, 4, 5].map((day) =>
        anArticle()
          .withDoi(`10.1055/a-0000-000${String(day)}`)
          .updatedAt(new Date(`2024-03-0${String(day)}T00:00:00Z`))
          .build(),
      ),
    }),
  updatedSince: new Date('2024-03-03T00:00:00Z'),
});
