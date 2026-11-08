# Adapters

[← Docs index](README.md) · [Main README](../README.md)

scholarly-mcp is built as ports and adapters. `packages/core` defines the ports (TypeScript interfaces in `packages/core/src/ports/`); everything that talks to the outside world is an adapter behind one of them. A publisher plugs in its own content API, database or access rules by writing an adapter and wiring it in one composition root, without touching search, the tools or the landing flow.

## Where adapters are wired

Only the composition roots create concrete adapters ([PLAN.md](PLAN.md#engineering-standards)):

| App    | Composition root                                                           | Wires                                                                                       |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Ingest | `apps/ingest/src/main.ts`                                                  | `Source`, `ArticleEnricher`, `IndexStorage`, `Embedder`                                     |
| Server | `apps/server/src/main.ts`, `apps/server/src/runtime/open-server-stores.ts` | `IndexReader`, `Embedder`, `SessionStore`, `RateBucketStore`, `UsageOutbox`, `Entitlements` |

The layering rules (`pnpm depcruise`) keep it that way: an adapter package depends on `core` only, never on another adapter or an app.

## The ports

| Port              | What it does                                                              | Adapters today                                       | Contract suite (`@scholarly-mcp/testkit`)            |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `Source`          | Pages through a content source and emits canonical `Article`s             | Crossref (`source-crossref`)                         | `runSourceContract`                                  |
| `ArticleEnricher` | Adds subjects and a matching-only full-text reference to articles, by DOI | Europe PMC (`source-europepmc`)                      | `runEnricherContract`                                |
| `Embedder`        | Turns passages and queries into vectors                                   | ONNX multilingual-e5-small (`embedder-onnx`)         | `runEmbedderContract`                                |
| `IndexStorage`    | Builds an index next to the live one, verifies it and swaps it in         | SQLite (`store-sqlite`), Postgres (`store-postgres`) | `runIndexStorageContract`, `runArticleStoreContract` |
| `IndexReader`     | The server's read-only view of the live index, following swaps            | SQLite, Postgres                                     | `runArticleStoreContract`                            |
| `SessionStore`    | Landing sessions behind the link tokens, 24 h                             | SQLite, Postgres                                     | `runSessionStoreContract`                            |
| `RateBucketStore` | Token buckets for rate limits, shared across replicas on Postgres         | In memory, Postgres                                  | `runRateBucketStoreContract`                         |
| `UsageOutbox`     | Usage events waiting to be exported to billing                            | SQLite, Postgres                                     | `runUsageOutboxContract`                             |
| `SyncStateStore`  | Where the last ingest run stopped                                         | SQLite, Postgres                                     | `runSyncStateStoreContract`                          |
| `Entitlements`    | Whether an article can be read, and where to log in or buy                | Mock (`apps/server/src/access`)                      | none yet                                             |
| `Meter`           | Records usage without blocking a request; flushed on shutdown             | Outbox meter with a webhook exporter                 | none                                                 |

Every contract suite runs against each adapter of its port, so a new adapter is correct when its suite passes.

## Your own content API

The usual integration: index your own catalogue instead of Crossref.

1. **Write a source.** A package such as `packages/source-acme` that depends on `@scholarly-mcp/core` and exports `createAcmeSource(options): Source`:

   ```ts
   import type { Source } from '@scholarly-mcp/core';

   export function createAcmeSource(options: AcmeSourceOptions): Source {
     return {
       name: 'acme', // the sync-state key; keep it stable
       async fetchPage({ cursor, updatedSince }, signal) {
         const page = await options.api.list({ cursor, updatedSince, signal });
         return {
           articles: page.items.map(toArticle), // canonical Article, parsed with articleSchema
           ...(page.next && { nextCursor: page.next }),
         };
       },
     };
   }
   ```

   The rules every source follows ([ADR 0020](adr/0020-crossref-source-ingestion-rules.md)):
   - Emit `Article` objects that pass `articleSchema`: DOI, title, journal, authors, dates, licences, `isOpenAccess`, `isRetracted`, `landingUrl` on your site, and a `contentHash` over the fields that change search (core's `contentHashOf`).
   - The cursor is opaque text the ingest checkpoints after every page; a run resumes from it. No `nextCursor` ends the run.
   - `updatedSince` asks only for records changed since that instant (incremental runs).
   - Retractions: emit the retracted article with `isRetracted: true`; it is kept out of search and flagged when fetched by DOI.
   - Translate failures to `AppError` (`SOURCE_UNAVAILABLE` for outages, `INVALID_INPUT` for a cursor you do not know). The ingest retries a failed page on the next run.
   - Never log record content, only counts.

2. **Test it with the contract.** Record a few pages of your API and run the shared suite against them, as `packages/source-crossref/src/create-crossref-source.test.ts` does:

   ```ts
   runSourceContract('acme', {
     create: () => createAcmeSource({ api: recordedApi() }),
     updatedSince: new Date('2026-10-01T00:00:00Z'),
   });
   ```

3. **Wire it in.** In `apps/ingest/src/main.ts`, create your source instead of (or next to) `createCrossrefSource`, reading its settings with a zod schema from the environment ([ADR 0014](adr/0014-config-from-environment.md)). Europe PMC enrichment is optional (`EUROPEPMC_ENABLED`); with your own subjects and full text you would turn it off or write your own enricher.

Full text stays matching-only whatever the source: chunks are searched but never returned, and only licences on `FULLTEXT_LICENSE_ALLOWLIST` are indexed ([ADR 0003](adr/0003-cc-by-nc-nd-full-text-for-matching-only.md)).

## Your own access rules

`check_access` and the access field on every card come from `Entitlements`. The default mock treats open access articles as open and everything else as subscription. Callers are anonymous ([ADR 0048](adr/0048-public-server-without-auth.md)), so `check` gets only the DOI and the open access flag. A publisher replaces it with a call to its entitlement service:

```ts
const entitlements: Entitlements = {
  async check({ doi, isOpenAccess }, signal) {
    if (isOpenAccess) return { status: 'open' };
    const offer = await acmeEntitlements.offer(doi, signal);
    return { status: 'subscription', loginUrl: offer.loginUrl, purchaseUrl: offer.purchaseUrl };
  },
};
```

Pass it as `entitlements` to `createApp` in `apps/server/src/main.ts`. It never sees query text. The `institution` status stays available for an adapter that can recognise a reader's institution by other means, such as institutional IP ranges; that needs a new ADR, as the server records no caller identity today.

## Your own store

The server and ingest choose SQLite or Postgres with `STORE` ([ADR 0034](adr/0034-postgres-store-adapter.md)). Another database means implementing `IndexStorage` and `IndexReader` (the index), plus the runtime ports (`SessionStore`, `RateBucketStore`, `UsageOutbox`, `SyncStateStore`), and passing their contract suites. `packages/store-postgres` is the worked example: schema-per-build swaps, a writer and a read-only role, versioned migrations.

## Your own embedding model

`EMBEDDER_MODEL` picks another ONNX model from the Hugging Face hub; vectors are sized by the model ([ADR 0028](adr/0028-selectable-embedding-model.md)). A different runtime (a hosted embedding API, for example) is a new `Embedder` adapter passing `runEmbedderContract`. A model change needs a re-embedded index (`ingest reembed`), and the golden-set eval shows whether it helps ([evaluating search](guides/evaluating-search.md)).

## Usage and billing

Tool calls and landing visits become usage events in an outbox, exported in batches to `METER_WEBHOOK_URL` with an HMAC signature ([operating guide](guides/operating-the-server.md#usage-metering)). To feed a billing pipeline, point the webhook at it; to write elsewhere, replace the exporter in `apps/server/src/metering/`.
