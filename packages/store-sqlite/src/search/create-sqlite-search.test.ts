import type { Doi } from '@scholarly-mcp/core';
import { aChunk, anArticle } from '@scholarly-mcp/testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSqliteIndexStore, type SqliteIndexStore } from '../create-sqlite-index-store.js';
import { createIndexSchema } from '../database/index-schema.js';
import { openDatabase } from '../database/open-database.js';

const signal = new AbortController().signal;
const filters = {};

const articles: [string, string, string][] = [
  ['10.1055/a-1', 'Versorgung durch Hausärzte', 'Die Ärzte behandelten 40 Patienten ambulant.'],
  ['10.1055/a-2', 'Vorhofflimmertherapie im Alter', 'Antikoagulation bei älteren Menschen.'],
  ['10.1055/a-3', 'Stroke after surgery', 'Strokes were rare after hip replacement.'],
  ['10.1055/a-4', 'Wohnortnahe Versorgung', 'Die Straße zum Krankenhaus war weit.'],
];

describe('SQLite lexical search with German text', () => {
  let store: SqliteIndexStore;

  beforeEach(async () => {
    const db = openDatabase(':memory:');
    createIndexSchema(db);
    store = createSqliteIndexStore(db);
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

  it('finds compounds by a part of them through the trigram table', async () => {
    expect(await dois('Vorhofflimmern')).toEqual(['10.1055/a-2']);
  });

  it('ranks chunks matching more words first', async () => {
    const hits = await dois('Versorgung', 'Hausärzte');
    expect(hits[0]).toBe('10.1055/a-1');
    expect(hits).toContain('10.1055/a-4' as Doi);
  });

  it('keeps the limit when trigram hits top up the list', async () => {
    const hits = await store.search.lexical(
      { terms: ['Versorgung', 'Vorhofflimmern'], filters, limit: 2 },
      signal,
    );
    expect(hits.map((hit) => hit.rank)).toEqual([1, 2]);
  });
});
