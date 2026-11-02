import { runArticleStoreContract } from '../contracts/article-store-contract.js';
import { runEmbedderContract } from '../contracts/embedder-contract.js';
import { runEnricherContract } from '../contracts/enricher-contract.js';
import { runSessionStoreContract } from '../contracts/session-store-contract.js';
import { runSourceContract } from '../contracts/source-contract.js';
import { runSyncStateStoreContract } from '../contracts/sync-state-store-contract.js';
import { DEFAULT_FULLTEXT_LICENSES } from '@scholarly-mcp/core';
import { anArticle } from '../builders/an-article.js';
import { createFakeEmbedder } from './fake-embedder.js';
import { createInMemoryEnricher } from './in-memory-enricher.js';
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

const openArticle = anArticle().withDoi('10.1055/a-0000-0010').openAccess().build();
runEnricherContract('in-memory enricher', {
  create: () =>
    createInMemoryEnricher([
      {
        doi: openArticle.doi,
        enrichment: {
          subjects: [{ label: 'Atrial Fibrillation', origin: 'mesh' }],
          fullText: {
            source: 'europepmc',
            id: 'PMC10',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            revision: '2024-08-01',
          },
        },
        sections: [{ label: 'Methods', paragraphs: ['We enrolled patients.'] }],
      },
    ]),
  matched: [openArticle],
  unmatched: anArticle().withDoi('10.1055/a-0000-0011').build(),
  allowlist: DEFAULT_FULLTEXT_LICENSES,
  now: new Date('2026-11-02T00:00:00Z'),
});
