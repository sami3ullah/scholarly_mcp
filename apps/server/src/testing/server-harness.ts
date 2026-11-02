import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { CallToolResult } from '@modelcontextprotocol/server';
import {
  doiSchema,
  type Article,
  type ArticleRecord,
  type SessionStore,
} from '@scholarly-mcp/core';
import {
  aChunk,
  anArticle,
  createFakeClock,
  createFakeEmbedder,
  createInMemoryArticleStore,
  createInMemorySessionStore,
  createSequentialTokens,
  createTestLogger,
  type CapturedLine,
  type InMemoryArticleStore,
} from '@scholarly-mcp/testkit';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createApp, type AppDeps } from '../create-app.js';

export const LANDING = 'https://landing.example.org';
export const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
/** Text that exists only in a full-text chunk: it must never appear in any response. */
export const FULL_TEXT_MARKER = 'Zebrafinkenprotokoll';
export const FULL_TEXT_REF = {
  source: 'europepmc',
  id: 'PMC9999999',
  licenseUrl: CC_BY,
  revision: 'rev-2026-07-01',
} as const;

const embedder = createFakeEmbedder();
const signal = new AbortController().signal;

interface Fixture {
  readonly article: Article;
  readonly chunks: readonly { text: string; section?: string; fullText?: boolean }[];
}

/** A small corpus covering the cases the tools treat differently. */
export function fixtures(): Fixture[] {
  return [
    {
      article: {
        ...anArticle()
          .withDoi('10.1055/a-1001')
          .withTitle('Rivaroxaban dosing in atrial fibrillation')
          .withAbstract(
            'Results: Lower doses were safe.\n\nConclusion: Rivaroxaban can be reduced in elderly patients.',
          )
          .inJournal('Thrombosis and Haemostasis', '0340-6245')
          .publishedIn(2025, 3, 14)
          .withSubjects(
            { label: 'Atrial Fibrillation', origin: 'mesh' },
            { label: 'anticoagulation', origin: 'keyword' },
          )
          .openAccess()
          .build(),
        fullText: FULL_TEXT_REF,
      },
      chunks: [
        { text: 'Lower rivaroxaban doses were safe in elderly patients', section: 'Results' },
        {
          text: `Rivaroxaban dosing ${FULL_TEXT_MARKER} methods in detail`,
          section: 'Methods',
          fullText: true,
        },
      ],
    },
    {
      article: anArticle()
        .withDoi('10.1055/a-1002')
        .withTitle('Vorhofflimmern im Alter')
        .withLanguage('de')
        .withAbstract('Antikoagulation bei älteren Patienten mit Vorhofflimmern ist sicher.')
        .inJournal('DMW - Deutsche Medizinische Wochenschrift', '0012-0472')
        .publishedIn(2024, 6)
        .build(),
      chunks: [{ text: 'Antikoagulation bei älteren Patienten mit Vorhofflimmern' }],
    },
    {
      article: anArticle()
        .withDoi('10.1055/a-1003')
        .withTitle('Rivaroxaban dosing, a retracted study')
        .inJournal('Thrombosis and Haemostasis', '0340-6245')
        .publishedIn(2025)
        .retracted()
        .build(),
      chunks: [{ text: 'Rivaroxaban doses in elderly patients' }],
    },
    {
      article: {
        ...anArticle()
          .withDoi('10.1055/a-1004')
          .withTitle('Hip replacement outcomes')
          .withoutAbstract()
          .inJournal('Aktuelle Urologie', '0001-7868')
          .publishedIn(2024)
          .build(),
        licenses: [],
      },
      chunks: [{ text: 'Hip replacement outcomes' }],
    },
  ];
}

/** Builds the store records for fixtures, embedding chunks with the fake embedder. */
export async function recordsOf(list: readonly Fixture[]): Promise<ArticleRecord[]> {
  return Promise.all(
    list.map(async ({ article, chunks }) => {
      const vectors = await embedder.embedPassages(
        chunks.map(({ text }) => `${article.title} ${text}`),
        signal,
      );
      return {
        article,
        chunks: chunks.map(({ text, section, fullText }, ordinal) => {
          let chunk = aChunk()
            .of(article.doi, ordinal)
            .withText(text)
            .withEmbedding(...(vectors[ordinal] ?? []))
            .withModelVersion(embedder.modelVersion)
            .withLanguage(article.language ?? 'en');
          if (section !== undefined) chunk = chunk.inSection(section);
          if (fullText === true) chunk = chunk.fromFullText(CC_BY);
          return chunk.build();
        }),
      };
    }),
  );
}

export interface Harness {
  readonly client: Client;
  readonly store: InMemoryArticleStore;
  readonly sessions: SessionStore;
  readonly logs: CapturedLine[];
  /** Calls a tool and returns its result. */
  call(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  readonly transport?: 'http' | 'stdio';
  readonly records?: readonly ArticleRecord[];
  readonly overrides?: Partial<AppDeps>;
}

/** Starts the real app wiring on in-memory adapters and connects the SDK client to it. */
export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const store = createInMemoryArticleStore();
  const records = options.records ?? (await recordsOf(fixtures()));
  await store.upsert(records, signal);
  await store.writeIndexMeta(
    {
      version: 'v1',
      modelVersion: embedder.modelVersion,
      articleCount: records.length,
      chunkCount: records.reduce((total, { chunks }) => total + chunks.length, 0),
      builtAt: new Date('2026-11-01T10:00:00Z'),
    },
    signal,
  );
  const sessions = createInMemorySessionStore();
  const logs: CapturedLine[] = [];
  const factory = createApp({
    index: { reader: store, search: store, journals: store, version: () => 'v1' },
    embedder,
    sessions,
    tokens: createSequentialTokens(),
    clock: createFakeClock(new Date('2026-11-02T10:00:00Z')),
    logger: createTestLogger(logs),
    landingBaseUrl: LANDING,
    publisher: 'Thieme',
    journalUrlTemplate: 'https://journals.example.org/issn/{issn}',
    version: '0.0.0-test',
    ...options.overrides,
  });

  const client = new Client({ name: 'protocol-test', version: '0.0.0' });
  let closeServer = () => Promise.resolve();
  if (options.transport === 'stdio') {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const handle = serveStdio(factory, { transport: serverSide });
    closeServer = () => handle.close();
    await client.connect(clientSide);
  } else {
    const handler = createMcpHandler(factory);
    closeServer = () => handler.close();
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    );
  }

  return {
    client,
    store,
    sessions,
    logs,
    call: async (name, args = {}) => await client.callTool({ name, arguments: args }),
    close: async () => {
      await client.close();
      await closeServer();
    },
  };
}

/** The structured content of a result, typed loosely for assertions. */
export function structured(result: CallToolResult): Record<string, unknown> {
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

/** The text content of a result. */
export function textOf(result: CallToolResult): string {
  return result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
}

export const doi = (value: string) => doiSchema.parse(value);
