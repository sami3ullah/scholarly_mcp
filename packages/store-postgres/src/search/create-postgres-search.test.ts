import type { Doi } from '@scholarly-mcp/core';
import { aChunk, anArticle, TEST_EMBEDDING_DIMENSIONS } from '@scholarly-mcp/testkit';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PostgresIndexStore } from '../create-postgres-index-store.js';
import { freshIndexStore } from '../testing/index-schemas.js';

const signal = new AbortController().signal;
const filters = {};

const articles: [string, string, string][] = [
  ['10.1055/a-1', 'Versorgung durch Hausärzte', 'Die Ärzte behandelten 40 Patienten ambulant.'],
  ['10.1055/a-2', 'Vorhofflimmertherapie im Alter', 'Antikoagulation bei älteren Menschen.'],
  ['10.1055/a-3', 'Stroke after surgery', 'Strokes were rare after hip replacement.'],
  ['10.1055/a-4', 'Wohnortnahe Versorgung', 'Die Straße zum Krankenhaus war weit.'],
  ['10.1055/a-5', 'Defibrillation im Rettungsdienst', 'Die Schocks wurden früh abgegeben.'],
  ['10.1055/a-6', 'Darmkrebs im Alter', 'Die Vorsorge wurde seltener genutzt.'],
];

// The same cases as the SQLite search test, so both stores find German text alike.
describe('Postgres lexical search with German text', () => {
  let store: PostgresIndexStore;

  beforeAll(async () => {
    ({ store } = await freshIndexStore());
    await store.writer.upsert(
      articles.map(([doi, title, text]) => ({
        article: anArticle().withDoi(doi).withTitle(title).withLanguage('de').build(),
        chunks: [
          aChunk()
            .of(doi)
            .withText(text)
            .withLanguage(doi === '10.1055/a-3' ? 'en' : 'de')
            .build(),
        ],
      })),
      signal,
    );
  });

  const dois = async (...terms: string[]) =>
    (await store.search.lexical({ terms, filters, limit: 10 }, signal)).map((hit) => hit.doi);

  it.each([['Aerzte'], ['ärzte'], ['ÄRZTE']])(
    'matches umlaut spellings alike: %s',
    async (term) => {
      expect(await dois(term)).toContain('10.1055/a-1' as Doi);
    },
  );

  it('matches ß and ss alike', async () => {
    expect(await dois('Strasse')).toEqual(['10.1055/a-4']);
  });

  it('matches other inflections through the stem', async () => {
    expect(await dois('Patient')).toEqual(['10.1055/a-1']);
    expect(await dois('stroke')).toEqual(['10.1055/a-3']);
  });

  it('finds compounds by a part of them through the trigram index', async () => {
    expect(await dois('Vorhofflimmern')).toEqual(['10.1055/a-2']);
  });

  it('finds a compound by its last part through the trigram index', async () => {
    expect(await dois('Krebs')).toEqual(['10.1055/a-6']);
  });

  it('does not find a word only containing a stem in its middle', async () => {
    expect(await dois('fibrillation')).toEqual([]);
  });

  it('ranks chunks matching more words first', async () => {
    const hits = await dois('Versorgung', 'Hausärzte');
    expect(hits[0]).toBe('10.1055/a-1');
    expect(hits).toContain('10.1055/a-4' as Doi);
  });

  it('ranks a title match above a match in the text', async () => {
    expect((await dois('Alter', 'Vorsorge'))[0]).toBe('10.1055/a-6');
  });

  it('stems in the query language when one is given', async () => {
    const hits = await store.search.lexical(
      { terms: ['Patient'], language: 'de', filters, limit: 10 },
      signal,
    );
    expect(hits.map((hit) => hit.doi)).toEqual(['10.1055/a-1']);
  });

  it('keeps the limit when trigram hits top up the list', async () => {
    const hits = await store.search.lexical(
      { terms: ['Versorgung', 'Vorhofflimmern'], filters, limit: 2 },
      signal,
    );
    expect(hits.map((hit) => hit.rank)).toEqual([1, 2]);
  });
});

describe('Postgres vector search', () => {
  it('fills the list past chunks a filter rejects', async () => {
    const { store } = await freshIndexStore();
    const records = Array.from({ length: 60 }, (_, n) => {
      const doi = `10.1055/v-${String(n)}`;
      const article = anArticle()
        .withDoi(doi)
        .publishedIn(n < 55 ? 2020 : 2025)
        .build();
      return {
        article,
        chunks: [
          aChunk()
            .of(doi)
            .withEmbedding(1, n / 60)
            .build(),
        ],
      };
    });
    await store.writer.upsert(records, signal);
    const embedding = new Float32Array(TEST_EMBEDDING_DIMENSIONS);
    embedding.set([1, 0]);
    const hits = await store.search.vector(
      { embedding, filters: { yearFrom: 2025 }, limit: 5 },
      signal,
    );
    expect(hits.map((hit) => hit.doi)).toEqual(
      [55, 56, 57, 58, 59].map((n) => `10.1055/v-${String(n)}`),
    );
  });
});
