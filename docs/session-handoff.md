# Session handoff

Append-only. Newest entry at the bottom.

## 2026-11-02 - session 1

- **Objective:** build scholarly-mcp per `docs/PLAN.md` (source: claude.ai doc "Thieme MCP Server: Engineering Plan").
- **Authorizations:** user asked to create the folder, name the app, create tickets in sizeable chunks and start building; compact and move to a fresh conversation before context gets large. Local git commits OK; no remote/GitHub repo yet (gh CLI not installed).
- **Progress:** repo created, plan saved, tickets SM-00..SM-15 written.
- **Next:** SM-00 spike, then SM-01 foundations.

## 2026-11-02 - session 1, end

- **Decisions from user:** Node 24 LTS (ADR 0001). Next.js for the landing app only; MCP server stays a separate Node app (as in plan).
- **Done:** SM-00 spike (results in `docs/spike-results.md`, ADR 0002 keep e5-small). SM-01 foundations: pnpm + turbo workspace, strict TS, ESLint (typed, strict), Prettier, Vitest projects with 85% core coverage gate, dependency-cruiser layering rules (verified they catch a violation), Husky + lint-staged + commitlint, CI workflow, Changesets, PR template. `packages/core` has `normalizeDoi`; `packages/testkit` is an empty shell.
- **Gotchas:** run `source ~/.nvm/nvm.sh && nvm use` first (default nvm node is not 24). `pnpm exec changeset init` is interactive, don't run it. Vitest 5 `projects` must point at `*/vitest.config.ts` files. Docker Desktop may need `open -a Docker`.
- **Open questions for user (defaults in effect):** CC BY-NC-ND full text for matching only? (default: CC BY only). Subjects source, since Crossref has none (default: curated journal-level subjects preset). `CROSSREF_MAILTO` address for the polite pool (not set; never use the user's email without asking). GitHub repo/remote (none yet; gh CLI not installed). Claude Desktop / MCP Inspector manual check of the hello tool still pending.
- **Next:** SM-02 core domain, ports, config, errors, testkit (see ticket). Then SM-03 and SM-04 (can be done in either order).

## 2026-11-02 - session 1, GitHub

- **Remote:** `origin` = git@github.com:sami3ullah/scholarly_mcp.git (SSH; HTTPS has no stored credentials). User asked to push as we build: push `main` after each finished chunk.
- **Docs:** root `README.md` (badges, TOC, mermaid diagram, roadmap table mirroring `tickets/README.md`), `docs/README.md` index, `docs/adr/README.md` index. When a ticket finishes, update the roadmap row in README too; when a guide ships, link it from `docs/README.md`.

## 2026-11-02 - session 1, owner decisions

- Open questions resolved: ADR 0003 (CC BY-NC-ND full text for matching only, strict never-shown guardrails), ADR 0004 (subjects from Europe PMC MeSH/keywords, journal-level fallback preset), ADR 0005 (Crossref public pool; optional `CROSSREF_MAILTO`; listed in README Limitations). Tickets SM-02/03/06/11/14 updated with the resulting tasks.
- CI on GitHub is green (Actions run 41470643449).
- **Next:** SM-02.

## 2026-11-02 - session 2, SM-02 done

- **Done:** SM-02. Core has zod schemas (Article and parts, Chunk with origin/source/licence, SyncState, UsageEvent, IndexMeta, LandingSession, Token, ArticleCard, AccessStatus), DOI property tests (fast-check), `AppError` factory (no classes), `parseConfig` plus fulltext and landing config sections, and ports (Source, ArticleReader, ArticleWriter, ArticleSearch, SyncStateStore, SessionStore, Embedder, Entitlements, Meter, Clock, RandomToken, Logger). New `packages/logger` (pino, redaction, `LOG_LEVEL`). Testkit: builders, in-memory fakes, contract suites for article store, session store, sync state store and source; they pass against the fakes. ADRs 0006-0018 record the plan's 13 key decisions; ADR 0019 covers the logger package and core boundaries. CI green (run 41473302605).
- **Gotchas:** root `lint`/`test` now run `turbo run build` first, because packages resolve each other through `dist/`. Contract suites live in testkit and import vitest (peer dep). The fakes use `settle()` so an aborted signal rejects instead of throwing synchronously. Core loads `@types/node` only for global types; depcruise still blocks built-in imports.
- **Next:** SM-03 Crossref source (or SM-04; either order works). SM-03 should define its Crossref config section in its own package (ADR 0014) and run `runSourceContract` on recorded fixtures.

## 2026-11-02 - session 3, SM-03 done

- **Done:** SM-03. Core gained `normalizeText`, `activeLicense` (version-of-record licence gate, embargo = closed), `hashArticleContent` (canonical SHA-256), `incrementalWindow` (1-day overlap; failed runs retry their window) and the `SOURCE_UNAVAILABLE` error code. New `packages/source-crossref`: config section, JATS cleaner (htmlparser2), record mapping, notice/erratum/retraction classification, retry/backoff/pacing HTTP client, cursor walk sorted by deposit date with watermark restart on expired cursors, retraction-notice follow-up lookups. Source contract + msw tests on real recorded fixtures (`packages/source-crossref/fixtures`, re-record with `scripts/record-fixtures.mjs`). ADR 0020 records the rules and the live-API facts behind them. `presets/thieme.env` started.
- **Gotchas:** msw 3 uses `onUnhandledFrame`, not `onUnhandledRequest`. Crossref cannot `select` `language`, so full records are fetched. `from-update-date` is day-granular; the source filters the exact instant. Every Bash call needs `source ~/.nvm/nvm.sh && nvm use` (an older default Node breaks msw with `Set.prototype.intersection`).
- **Next:** SM-04 chunker and ONNX embedder. SM-05 must use `incrementalWindow`, checkpoint per page and schedule periodic full runs so embargoes open (task added to the ticket).

## 2026-11-02 - session 4, SM-04 done

- **Done:** SM-04. Core: `detectLanguage` (de/en stopword scoring, `undefined` when unsure), `splitSentences` (Intl.Segmenter + abbreviation/initial repair), `parseAbstract` (labels trusted only with 2+ distinct ones), `articleSections` (abstract sections, or one `metadata` chunk of title + subtitle), `chunkDocument` (sections and language changes are hard boundaries, balanced packing to 400 tokens, paragraph-first, word fallback, up to 2 sentences / 100 tokens overlap, title prepended to `embeddingText`, `overlapLength` for tests). `Embedder` port gained `countTokens` (function property). Testkit: `createFakeEmbedder`, `runEmbedderContract`. New `packages/embedder-onnx`: pinned revision `761b726d…`, q8, `MODEL_VERSION`, semaphore shared by queries and batches, warm-up on load, config `EMBEDDER_CACHE_DIR/ALLOW_REMOTE/BATCH_SIZE/CONCURRENCY`. ADR 0021. Also fixed SM-03 cleaner: singular German run-in headings (Ergebnis, Schlussfolgerung) were never split.
- **Findings:** 9% of sample abstracts are English but declared `de` by Crossref; per-chunk detection handles it. q8 batching changes vectors (cos 0.99956) and is slower on CPU, so batch size defaults to 1 and the contract demands batch-independent vectors (1e-5). On the 500-record sample: no chunk > 400 tokens, max model input 431/512.
- **Gotchas:** real-model tests cache the model in `.cache/models` (gitignored, ~135 MB, CI caches it keyed on the revision). First local run downloads it (~50 s). `Doi` is branded: use `doiSchema.parse` in tests.
- **Next:** SM-05 SQLite store and ingest CLI. Use `articleSections` + `chunkDocument({ countTokens: embedder.countTokens })`, embed `embeddingText`, skip re-embedding on unchanged `contentHash`; use `incrementalWindow`, checkpoint per page, schedule periodic full runs. Decide whether article `language` is corrected from chunk languages (ADR 0021 consequence).

## 2026-11-02 - session 5, SM-05 code done, exit check pending

- **Done (all pushed):** `packages/store-sqlite` (index file: articles, chunks, folded + Snowball-stemmed FTS5, trigram FTS, `vec_chunks`, index_meta, sync_state; runtime file: landing_sessions, usage_events; build to `<INDEX_PATH>.building`, resume, verify, atomic rename; `openIndexReader` with `refresh()`), `apps/ingest` (`full`, `incremental`, `verify`; `pnpm ingest <cmd>` reads `.env`). Core: `SyncState.lastFullRunAt`. Testkit contract: lexical search also matches the article title. ADR 0022 records every decision, including the user-delegated one: article `language` stays as Crossref declares it; filters use chunk language with article fallback. Ingestion guide at `docs/guides/ingestion.md`. Follow-ups added to SM-07, SM-09, SM-10.
- **Live results (layout 1):** 70,911 articles, 89,388 chunks, 508 MB, full build 23 min with `CROSSREF_ROWS=1000`; second incremental wrote 0 rows; verify passed 17/17. Vector scan was 1.2 s, so layout 2 moved vectors into a plain table carrying the filter columns: ~60 ms unfiltered, 32-40 ms filtered. Lexical 1-14 ms.
- **In flight when this was written:** rebuild on layout 2 (`ingest incremental` auto-planned full, reason `index layout changed`), log `data/ingest-v2.log`.
- **Next steps:**
  1. Check `data/ingest-v2.log` ends with `Index swapped in`; if the process died, rerun the same command (it resumes the `.building` file): `CROSSREF_ROWS=1000 EMBEDDER_CACHE_DIR=.cache/models node --env-file=presets/thieme.env apps/ingest/dist/main.js incremental`.
  2. Run it once more and confirm `written: 0`; then `... main.js verify` (exit 0).
  3. Re-time vector search on the real index (expect ~60 ms).
  4. Tick the exit task in `tickets/SM-05-sqlite-store-ingest.md`, mark SM-05 `done` in `tickets/README.md` and ✅ in the README roadmap, commit, push.
  5. Then SM-07 (search service), recommended before SM-06.
- **Gotchas:** without `nvm use`, better-sqlite3 segfaults (wrong Node). better-sqlite3 must not be in `onlyBuiltDependencies` (its prebuilds are used; node-gyp is absent). `data/` is gitignored. `verifyLiveIndex` opens read-write because the FTS5 integrity check is an INSERT. Bump `INDEX_SCHEMA_VERSION` on any schema or text-processing change.
- **User preference:** after completing anything, end with copy-paste commands to run and verify it, with expected output.

## 2026-11-02 - session 5, SM-05 done

- **Exit check passed on layout 2:** `ingest incremental` auto-rebuilt in full (`index layout changed`), 70,911 articles / 89,388 chunks in 25 min, 551 MB; next incremental `written: 0`; `ingest verify` exit 0. Through the store port: vector top 50 p95 95 ms (51 ms filtered), lexical 2-13 ms.
- **Next:** SM-07 search service (recommended before SM-06). `data/index.sqlite` is a real index to develop against.

## 2026-11-02 - session 6, SM-07 done

- **Done (all pushed):** SM-07. New `packages/search` (core and zod only, enforced by a dependency-cruiser rule): query normalisation, DOI shortcut, stopwords and one-letter words left out of lexical terms (stopword-only = vector only), DE/EN abbreviation map expanded on both sides, detected query language passed as the new optional `LexicalQuery.language` (store stems in it alone, else both), parallel lexical + vector top 50, RRF k=60 on chunks, collapse to best chunk per article, exact title boost, tie-break newer then DOI, teaser and `whyMatched` builders, base64url cursor with index version (`CURSOR_STALE`), 2 s budget that races the signal (`TIMEOUT`), LRU of query embeddings keyed by SHA-256, config `SEARCH_BUDGET_MS/CANDIDATES/CACHE_SIZE`. `foldText` moved to core. testkit gained `createTestLogger` (shared, was copied twice) and a store-contract property test. New `apps/eval` with `bench`. ADR 0023 records every rule. Follow-ups added to SM-08 and SM-09 tickets.
- **Exit result:** `pnpm eval bench --rounds 5` on the live index, embedding cache off: 225 searches, p50 104 ms, p95 132 ms, max 193 ms, no failures, no empty lists. `pnpm check` green (688 tests, 96.9% line coverage).
- **Observations:** 286 indexed articles have non-10.1055 DOIs (10.53886, 10.5935): journals Thieme publishes under the journal's own prefix, returned by Crossref's prefix route; landing URLs point to the journals' sites. Not a search issue; worth a look before SM-11 links (landing URL is not thieme-connect). Untuned quality looks sensible (`pnpm eval bench --show`); weak spot seen: "Sepsis auf der Intensivstation" ranks Intensivstation-only titles first.
- **Next:** SM-08 golden set and eval (add an `eval` command to `apps/eval`; decide mono vs dual stemming, BM25 weights, candidates). SM-06 and SM-09 are also unblocked.
- **CI fix (same session):** CI had been red since the SM-05 commits: `store-sqlite/package.json` never declared `better-sqlite3`, `sqlite-vec` and `snowball-stemmers` (installed locally, absent from the lockfile), so a clean install could not build it. Fixed in `1cb6d94`; verified with a fresh clone and `pnpm install --frozen-lockfile`, on macOS and in a `node:24` Linux container (build and store/search tests pass). The first CI run after the fix failed inside `pnpm install` with no readable log (public job logs need auth); Linux reproduction passed, so it was treated as a transient download failure and re-run with this commit.

## 2026-11-02 - session 7, SM-06 code done, live exit check running

- **Done (all pushed, `1bc211c`):** SM-06 code. New `packages/http` (retrying client moved out of source-crossref; `name`, `accept`, `minGapMs`, `gapFromHeaders`, `read(text, status)`). Core: `Article.fullText` reference (no text), `ArticleEnricher` port, `fullTextSectionSchema` with generic labels only, `enrichArticle` / `withoutFullText` (rehash). Testkit: `createInMemoryEnricher`, `runEnricherContract`. New `packages/source-europepmc` (batched DOI search, MeSH minus check tags, keywords, eligibility rules, JATS body reader with EN/DE labels and back-matter skipping, failure breaker). Store: `purgeFullText` and a `purge` build kind. Ingest: `EUROPEPMC_ENABLED`, per-article order in `prepare-record.ts`, `ingest purge-license <url>`. Search: full-text guardrail tests (property test). ADR 0024 has every rule. `pnpm check` green (808 tests, 96.75% lines). Thieme preset now sets `EUROPEPMC_ENABLED=true`.
- **Live facts:** 115/200 OA articles matched, 110 with eligible full text; full text TTFB 1.2-2.5 s, so the first enriched build takes hours (sequential on purpose; concurrency is the noted lever). Missing full text answers HTTP 500, JSON-only accept answers 406 (client sends `application/json, application/xml`).
- **In flight:** full rebuild with enrichment, log `data/ingest-epmc.log`, started ~20:21. The pre-enrichment index is kept at `data/index-pre-epmc.sqlite` for comparison.
- **Next steps:**
  1. Check the log ends with `Index swapped in` and `exit 0`; if it died, rerun the same command (resumes the build): `CROSSREF_ROWS=1000 EMBEDDER_CACHE_DIR=.cache/models node --env-file=presets/thieme.env apps/ingest/dist/main.js full`.
  2. Run `... main.js incremental` and confirm `written: 0`; then `... main.js verify` (exit 0).
  3. Record counts (articles with full text, full-text chunks, file size) and `pnpm eval bench --rounds 5` latency in the SM-06 ticket and ADR 0024 consequences; try a full-text-only query.
  4. Tick the exit task, mark SM-06 `done` in `tickets/README.md` and ✅ in the README roadmap, commit, push, check CI.
  5. Then SM-08 (golden set and eval) or SM-09.

## 2026-11-02 - session 7, moving on while the SM-06 build runs

- **Build status at handoff:** 13 of ~72 pages after 44 min (12,879 articles, 1,149 with full text, 0 skipped, 0 warnings); expected to finish ~3 h later. PID 48192, log `data/ingest-epmc.log`. A new conversation is not notified when it exits: check the log for `Index swapped in` and `exit 0`. If the process is gone without them, rerun the command in the previous entry (it resumes the build).
- **User decision:** continue with the next ticket in a fresh conversation meanwhile. Recommended: **SM-09** (MCP server). Do not start SM-08 tuning until the enriched index is swapped in, as its numbers would change.
- **Safe while the build runs:** editing code and `pnpm build` / `pnpm check` (the running process already loaded its modules). Avoid: deleting `data/`, running another `ingest` command, or `pnpm eval bench` (it would compete for CPU and measure the old index).
- **Still owed for SM-06:** next steps 2-4 of the previous entry (incremental `written: 0`, verify, record size and latency, mark done, push).

## 2026-11-02 - session 8, SM-09 done (worktree branch `sm-09`, merged into main)

- **Done:** SM-09. New `apps/server` (SDK v2: `@modelcontextprotocol/server` 2.4.0, `node` 2.1.2, `client` 2.4.0 for tests): six read-only tools, stdio and Streamable HTTP at `/mcp` (loopback only, localhost `Host`/`Origin` guards), one error mapping (tools parse their own input, so schema failures are `INVALID_INPUT` with `field`), landing sessions + links per card-returning call (falls back to DOI links if the session store fails), journal catalog cached per index version, mock entitlements, live index that survives a missing file and refreshes every 30 s. New `packages/cite` (citation-js; AMA CSL vendored, CC BY-SA). Core: card `license` (required), `canonicalDoiSchema` for output schemas, `buildLandingUrl`, `JournalDirectory` port + `mergeJournalTallies`, `ArticleReader.findArticleChunks`, `SearchFilters.journalIssns` (replaces `journalIssn`). Search: `related()` for `find_related`. ADR 0025; guide `docs/guides/connecting-clients.md`. `pnpm check` green (999 tests, 96% lines). Fixed a false positive in the SM-06 search full-text property test (word inside the query term).
- **Verified live (read-only on main's `data/index.sqlite`):** stdio and HTTP end to end with the real embedder; search 337 ms cold / 211 ms warm, `find_related` 101 ms; MCP Inspector CLI lists the six tools and runs a search. Still owed: Claude Desktop check by the user (config in the guide).
- **Gotchas:** Inspector starts the server without the shell env: use `node --env-file=...`. SDK input/output schemas must have no zod transforms. Never run the server through `pnpm` on stdio (banner breaks the protocol). The other session's SM-06 build was still running during this work; nothing in `data/` was touched.
- **Next:** finish SM-06 (other session), then SM-08 (follow-ups added from live observations) or SM-10 / SM-11.

## 2026-11-02 - session 7, SM-06 done

- **Done:** SM-06 exit check passed on the live corpus. The full rebuild with enrichment took 2 h 50 min and exited 0 with verify green: 70,911 articles, 176,433 chunks (87,045 full text), 6,861 articles with full text, 13,600 with subjects, 1,322 MB (was 551 MB). The next incremental wrote 0, and verify exited 0. Bench p50/p95: 204/287 ms (was 104/132). Full-text-only words find their article at rank 2, with a section-only `whyMatched` and no teaser. All numbers are in the SM-06 ticket and ADR 0024.
- **Found:** two ranking issues, added to SM-08. A prefix or stem title match beats an exact full-text match, and its `whyMatched` claims a query term the title does not contain. A vector-only neighbour can beat an exact rare-term hit.
- **Data:** `data/index.sqlite` is now the enriched index. `data/index-pre-epmc.sqlite` (the old one, 551 MB) can be deleted once SM-08 no longer needs a comparison. The `scholarly-mcp-sm-09` worktree is merged and can be removed with `git worktree remove ../scholarly-mcp-sm-09`.
- **Next:** SM-08, golden set and eval on the enriched index (follow-ups are in its ticket). After that, SM-10 or SM-11.

## 2026-11-03 - session 9, SM-08 done (exit unmet)

- **Done:** SM-08. Golden set v1 in `packages/testkit/golden/golden-set.json`: 60 queries, 1,257 graded judgments, pooled from six runs per query and judged blind from title and abstract by three Claude agents with one rubric (24-item spot check agreed). `eval golden` (recall@10 capped, MRR, nDCG@10, per group; `--show`, `--baseline`, `--write-baseline`). `ingest subset --from --dois --out` builds the eval index (2,959 articles, 15,946 chunks) from `corpus-dois.txt`; `baseline.json` is measured on it. Fixes: `whyMatched` names only terms the text contains; lexical RRF weight 1.01 (rare full-text word beats the vector top hit); trigram hits only at compound edges (no "Defibrillation" for "fibrillation"); teaser skips "Was ist neu?". ADR 0026 (results, decisions), ADR 0027 (proposed: measure bge-m3 first), guide `docs/guides/evaluating-search.md`, new ticket SM-16. `pnpm check` green (1,017 tests, 95.8% lines). Pushed `dccba8a`.
- **Numbers (live index):** recall@10 0.679 overall, de 0.586, en 0.895, cross 0.555; nDCG 0.629; MRR 0.892. Pre-EPMC index 0.667. Vector only 0.651, lexical only 0.594. No fusion, candidate, BM25, k or stemming variant moved recall beyond noise (table in ADR 0026). Bench p95 288 ms. Exit (0.8 / 0.7) not met: the embedding model is the limit.
- **User decision needed:** "Small committed index for CI eval" was not done: any index of the pooled articles holds abstracts and CC BY-NC-ND full text, and committing it would publish content (hard rules, ADR 0003). The gate runs locally on `data/eval-index.sqlite` instead; GitHub CI does not run it. Options: keep it local, a self-hosted runner with the index, or a CC BY-only eval index.
- **Data:** `data/eval-index.sqlite` is the eval index (rebuild command in the guide). `data/index-pre-epmc.sqlite` is no longer needed for SM-08 and can be deleted (551 MB); kept for now in case SM-16 wants it. The `scholarly-mcp-sm-09` worktree can still be removed.
- **Gotchas:** `pnpm add` in one workspace can unlink others' `node_modules`; run `pnpm install --frozen-lockfile` if builds suddenly miss `@scholarly-mcp/*`. commitlint caps body lines at 100 characters, and a rejected commit leaves files staged. Short queries almost never get a detected language, so lexical search stems in both languages.
- **Next:** SM-16 (embedding model evaluation on the eval index), or SM-10 / SM-11.

## 2026-11-03 - session 10, SM-16 done (e5-small kept)

- **Done:** SM-16. `EMBEDDER_MODEL` selects `multilingual-e5-small` (default), `multilingual-e5-base` or `bge-m3` from a pinned table in `embedder-onnx/src/model.ts`; dimensions come from the model (core has no fixed 384; `TEST_EMBEDDING_DIMENSIONS` in testkit). Index files are created for the model's vector size; a leftover build of another size is discarded; incremental on another model plans `full` (`embedding model changed`). `ingest reembed --from --out` re-embeds a copy with chunking unchanged (resumable). `eval golden --rankings FILE`. ADR 0028 (design), ADR 0029 (decision, supersedes 0002 and 0027). Golden set v2: 18 new judgments from blind-judging 172 unjudged candidate results (15 calibration pairs all agreed on relevant/not); baseline rewritten (e5-small recall 0.680).
- **Numbers (v2, eval index):** e5-small 0.680 / cross 0.600; e5-base 0.677 / 0.585; bge-m3 0.697 / 0.665, de 0.533 (worse). No difference outside a paired bootstrap 95% CI. bge-m3: vector scan 175 ms vs 66 ms at 176k chunks, 723 MB vectors, 560 MB model, ~6.5 h re-embed for a full rebuild. Chunk-size re-chunking not run (needs full re-ingest; reasons in ADR 0029).
- **Data (gitignored):** `data/eval-index-e5-base.sqlite`, `data/eval-index-bge-m3.sqlite`, rankings and golden/bench JSON per model in `data/`. Live index untouched. `data/index-pre-epmc.sqlite` (551 MB) and the `scholarly-mcp-sm-09` worktree can still be removed.
- **Still open, user decision:** CI eval gate (from SM-08): keep local / self-hosted runner / CC BY-only eval index.
- **Next:** SM-10 or SM-11. Recall levers left: query translation/expansion and a reranker (new ADR, measure on golden v2).

## 2026-11-03 - session 11, SM-10 done, CI eval gate decided

- **Owner decision:** CI eval gate stays local, enforced by `.husky/pre-push` (ADR 0030). It runs `eval golden --baseline` on `data/eval-index.sqlite` only when a push touches ranking code (~4 s); `SKIP_EVAL_GATE=1` skips once.
- **Done:** SM-10 (ADR 0031, guide `docs/guides/operating-the-server.md`). Core: `ApiKey` schema + `parseApiKey`, `ApiKeyStore` and `UsageOutbox` ports, usage status `INTERNAL`; testkit fakes + contracts; store-sqlite adapters and runtime migration 2 (`api_keys`). Server: `AUTH_MODE` none/api-key/oauth (keys `smk_<id>_<secret>`, SHA-256 stored, 5 s decision cache; JWT via jose with issuer/audience/exp, RFC 9728 metadata), `HTTP_ALLOWED_HOSTS`/`HTTP_ALLOWED_ORIGINS` (required beyond loopback), per-caller token bucket per tool call (`RATE_LIMITED` + `retryAfter`), outbox meter + exporter (JSON lines always, signed webhook optional, at least once, jittered backoff, 30-day retention), `/healthz`, `/readyz`, `/metrics` (`@prometheus-io/client`), OTLP traces when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`@opentelemetry/sdk-trace` 3.0), SIGTERM drain + outbox flush, `scholarly-mcp keys create|list|revoke`. `pnpm check` green (1,123 tests, 95.96% lines).
- **Live smoke (real index):** 401 without key; search with key 5 cards 349 ms; both events in `usage.jsonl` within 1 s; metrics counted; SIGTERM exit 0; no query text or key in logs/events.
- **Gotchas:** web `Request` drops `Host`, so the Host allowlist checks the URL host (the Node adapter builds it from `Host`). API key secrets are base64url and may contain `_`: take the last 43 chars, never split on `_`. OTel 2.x `sdk-trace-node` and `prom-client` are deprecated; use the 3.0 line (api 1.10) and `@prometheus-io/client`. `SimpleSpanProcessor`/`BatchSpanProcessor` take `{ exporter }`.
- **Still open for the user:** Claude Desktop manual check (from SM-09).
- **Next:** SM-11 (landing sessions and Next.js landing page), then SM-12. Follow-ups added to SM-13 (Postgres key store and outbox with row claiming) and SM-14 (image entrypoint for `keys`, internal `/metrics`, shared rate limits for replicas).

## 2026-11-03 - session 12, SM-11 done

- **Done:** SM-11 (ADR 0032, guide `docs/guides/landing-page.md`).
  - **Core.** `landingPageSchema`, the page contract shared by the server and the app; it strips text from a full-text passage. Also `doiUrl`.
  - **Server.** `landing/`: `createLandingPages` builds the chosen article, the other results in order, the matched passage, topics from shared subjects, access via entitlements and up to 3 related articles. Each side system fails soft. `createLandingApi` serves `GET /landing/v1/page` and `POST /landing/v1/visits`. Config adds `LANDING_API_SECRET` (required beyond loopback), `LANDING_RATE_LIMIT_*` and `HTTP_ALONGSIDE_STDIO`. Metrics `landing_pages_total{session}` and `landing_visits_total{tool}`. `createApp` now returns `{ factory, landingPages }`.
  - **New `apps/landing`.** Next.js 16.4.4 and React 19.3.1: server components, a beacon hook, an expandable abstract, CSS Modules on tokens, en/de strings.
  - **Tests.** Playwright with axe (28 tests, desktop and mobile) and Lighthouse CI run against `e2e/stub-api.mjs`, which serves synthetic articles. New CI job `landing`. ESLint has the react-hooks and next plugins, and two new depcruise rules guard the landing app.
- **Verified live (real index, ports 8080/3100):** a German search link renders the page in 0.2-0.27 s. Lighthouse LCP is about 620 ms, with performance and accessibility at 1.0. An unknown DOI answers 307 to doi.org, and a dead link answers 404. `pnpm check` is green: 1,236 tests, 95.8% lines.
- **Gotchas:**
  - **No `loading.tsx` on `/mcp/landing`.** A streamed shell fixes the status at 200, which breaks the redirect and 404 (ADR 0032).
  - **No `output: 'standalone'`.** `next start` refuses it; the image belongs to SM-14.
  - **Root scripts.** `build:packages` skips the landing app; use `pnpm --filter @scholarly-mcp/landing build`.
  - **Headless UAs.** Headless Chrome's UA counts as a preview agent, so Playwright's desktop project sets a normal UA.
  - **Testing Library.** It needs `src/testing/setup.ts` for cleanup, because vitest globals are off.
  - **Port 3000.** On this machine port 3000 is held by another Next server (since Oct 27), so local checks used 3100. The preset still points links at 3000.
  - **Playwright browser.** Run `pnpm --filter @scholarly-mcp/landing exec playwright install chromium` once.
- **Not pushed CI-verified yet:** the new `landing` CI job has only run locally (same commands).
- **Still open for the user:** Claude Desktop manual check (from SM-09), now with `HTTP_ALONGSIDE_STDIO=true` so the links open.
- **Next:** SM-12 (MCP Apps cards and funnel dashboard). Its visit events must go into the outbox, because `visitCount` is deleted with its session (follow-ups are in the ticket). Then SM-13 and SM-14.

## 2026-11-03 - session 13, SM-12 done

- **Owner decisions (ADR 0033):** the funnel is a CLI over the JSON lines export that writes a static HTML report. Visits count per token and DOI. Next actions come from a beacon on the landing page's access buttons.
- **CI fix first:** `check` had failed since SM-16, because `model.ts` pins three revisions and the cache key step grepped one SHA. The cache now keys on `hashFiles('packages/embedder-onnx/src/model.ts')`. CI was green on `4490746` (both jobs).
- **Done:** SM-12 (ADR 0033, guide `docs/guides/funnel-and-card-view.md`).
  - **Core.** `UsageEvent` is a union on `kind`. `tool_call` gains `cardsByJournal`. The new kinds `landing_visit` and `landing_action` are always `billable: false`. Core also gets `toWireEvent`/`parseWireEvent` (it reads pre-SM-12 lines without `kind`) and `computeFunnel` (dedupes by id). `LandingSession.tool` is optional.
  - **Store.** Runtime migration 3: sessions get a `tool` column, and `usage_events` is rebuilt as an envelope plus a JSON `payload`, with old rows copied as tool calls.
  - **Server.** `landing/create-referrals.ts` records visits and actions only for a live token with the DOI in the results, with the journal from the index and id = sha256(kind, token, doi[, action]) in base64url. The visits route now requires `doi`. New `POST /landing/v1/actions` and `landing_actions_total{action}`. New `scholarly-mcp funnel --from --out [--json --since --until --key]` command. Tool replies report `cards`, so the factory records cards per journal.
  - **Landing app.** The visit beacon fires once per token, DOI and tab, and skips same-origin moves without UTM tags. `ActionTracker` plus `data-action` on the `ButtonLink`s post to `/mcp/landing/action`. A shared `referralRoute` handles both routes.
  - **New `packages/card-view`.** esbuild inlines `src/view` (the ext-apps `App`, from `app-with-deps`) into `dist/card-view.html` (597 KB, 133 KB gzipped). The server registers `ui://scholarly-mcp/cards.html` (no CSP domains), and `search_articles` has `_meta.ui.resourceUri`.
- **Verified:**
  - **`pnpm check`.** Green: 1,304 tests, 95.69% lines.
  - **Playwright.** The landing suite passes: 36 tests, desktop and mobile.
  - **Live smoke (real index, stdio with the landing API on 8091).** The UI metadata and the resource are served. The search took 980 ms. A visit and an action went to `usage.jsonl` with the journal and no token, the repeated visit was stored once and the forged DOI recorded nothing. `funnel` reported 1 search, 5 cards, 1 visit and 1 action. No query text appears in the export.
  - **Report.** Checked by screenshot in light, dark and phone layouts.
- **Gotchas:**
  - **`pick` and refinements.** zod `.pick()` fails on schemas with refinements; use `serverOwnConfigSchema.pick` (the funnel command does).
  - **Card view tsconfig and lint.** Browser code needs its own `src/view/tsconfig.json` so the ESLint project service finds it. Use `app.addEventListener('toolresult', …)`, because the `on*` setters are deprecated and fail lint.
  - **Commit subjects.** commitlint rejects an uppercase subject start ("MCP …").
  - **Workspace deps in zsh.** Quote `"pkg@workspace:*"`, or zsh globs it.
  - **Browser in CI.** The card view's Chromium test needs `playwright install chromium` for `@scholarly-mcp/card-view`. It was added to the CI `check` job, but that job has not run on GitHub yet.
  - **Metric vs funnel.** `landing_visits_total` counts accepted beacons, so a repeat adds 1. The funnel counts unique ids.
- **Still open for the user:** the Claude Desktop manual check, now covering both links (`HTTP_ALONGSIDE_STDIO=true`) and the card view.
- **Next:** SM-13 (Postgres adapter: the outbox as envelope plus `jsonb`, row claiming, sessions with `tool`; a live funnel view is a follow-up there), then SM-14.

## 2026-11-03 - session 14, SM-13 in progress (runtime half done)

- **Objective:** SM-13 Postgres adapter. Design in ADR 0034 (accepted, written this session). No owner decisions were needed; all choices are recorded in the ADR.
- **Done (committed on `main`):**
  - `3f5e03d` ADR 0034: one stemmer for both stores, `tsv` over TS-stemmed columns with `to_tsquery('simple')` built from tokenised terms, `pg_trgm` compound top-up, HNSW with `iterative_scan = strict_order`, schema-per-build with a `scholarly.live_index` pointer (keep previous, drop older), runtime migrations under an advisory lock, server role grants, outbox `claim`/`release`, `STORE=sqlite|postgres` + `DATABASE_URL`, async index reader.
  - `424f924` new `packages/lexical` (folding, Snowball stems, `trigramStems`, `hasStemAtWordEdge`); `store-sqlite` imports it, FTS5 syntax stays there. Dep-cruiser rule `lexical-only-core`; coverage includes it.
  - `67328d5` outbox port: `pending` replaced by `claim(limit, now, leaseUntil)` + `release(ids)`; `markExported` ends the lease. In-memory fake, contract (lease, release, concurrent claims), SQLite runtime migration 4 (`claimed_until`), exporter leases for 2x pass timeout and releases a refused batch. Test for two exporters sharing an outbox.
  - `89c5d22` `packages/store-postgres`: `pg` pool helpers (`query` checks the signal first, `inTransaction`, `identifier`), runtime migration 1 in schema `scholarly` (sessions with `tool`, api_keys, usage_events envelope + `jsonb` + `claimed_until`, `live_index`, `index_build`), `assertMigrated`, `grantServerRole`, `postgresConfigSchema` (`DATABASE_URL`, `PG_POOL_MAX`, `PG_STATEMENT_TIMEOUT_MS`, `PG_SERVER_ROLE`). Session, API key and outbox stores pass the testkit contracts on Testcontainers (26 tests). Vitest `globalSetup` starts one `pgvector/pgvector:0.8.7-pg18-trixie` container; `freshPool()` makes a database per test.
- **Next, in order:**
  1. Index store in `store-postgres`: build schema DDL (chunks with filter columns, `text_stemmed`/`text_folded`/`title_stemmed`, generated weighted `tsv` + GIN, `pg_trgm` GIN on folded title+text, `vector(dims)` HNSW), writer/reader/search/journals/sync state, `beginIndexBuild` (full / incremental and purge copy the live schema) with commit flipping `live_index` and granting `PG_SERVER_ROLE`, verify, purge. Run `runArticleStoreContract` and `runSyncStateStoreContract`.
  2. Make the server's index reader async (`open`/`refresh` return promises; `apps/server/src/runtime/live-index.ts`), then `STORE=sqlite|postgres` wiring in server, ingest (`ingest migrate` command) and eval; keys command on the writer URL.
  3. `docker compose --profile postgres` (roles `scholarly_ingest` owner, `scholarly_server`), docs guide, README roadmap and docs index.
  4. Exit: copy `data/eval-index.sqlite` into Postgres without re-embedding (a copy command like `ingest subset`), run `eval golden` on both, record the gap in ADR 0034 (within 2 points). Tune `hnsw.ef_search` if needed.
  5. Follow-up from SM-12: live funnel view over `scholarly.usage_events` (decide shape; note events are pruned after 30 days).
- **Gotchas:** zsh `set -e` inside a one-line chain did not stop on a failed `git commit`; commit one step per command. lint-staged fails on a test importing a workspace package that is not staged yet. `better-sqlite3` rejects `?1`-style numbered params when the same values are bound positionally; use plain `?`. Run tests from the repo root (`pnpm exec vitest run --project store-postgres`); Docker must be running.
- **Pushed** to origin (`1ce5de6`); the pre-push eval gate passed. `pnpm check` green except `format:check` on the gitignored, Next-generated `apps/landing/next-env.d.ts` (local only): 1,341 tests, 95.56% lines. CI has not run the new Testcontainers suite yet; the GitHub runner needs Docker (ubuntu-latest has it).

## 2026-11-03 - session 15, SM-13 step 1 done (Postgres index store)

- **Objective:** SM-13 "Next, in order" step 1 from session 14: the Postgres index store per ADR 0034.
- **Done (committed on `main`):**
  - `ec9437c` refactor: `toJsonWithDates`/`fromJsonWithDates` moved from `store-sqlite` to core (`core/src/json`). `VerifyCheck`, `VerifyReport`, `verifyResult` and `sampleQueryChecks` (title and own-vector sample queries over `reader` + `search`) moved to core (`core/src/indexing/verify-report.ts`). `store-sqlite` re-exports the types, so the ingest is unchanged.
  - `924dd61` `store-postgres` index store:
    - Runtime migration 2 creates the `vector` and `pg_trgm` extensions.
    - `database/index-schema.ts` (`INDEX_LAYOUT_VERSION = 1`) defines the per-build schema: `layout` (version, dimensions), `articles` (record `jsonb`), `chunks` (filter columns plus `search_language`, `text_stemmed`/`text_folded`/`title_stemmed`/`title_text_folded`, generated weighted `tsv`, `vector(d)`), `index_meta` and `sync_state`. Indexes: by doi, GIN `tsv`, GIN trigram, HNSW cosine. A copy creates the indexes after the rows.
    - `createPostgresIndexStore(pool, schema)`: batched `unnest` upserts (last record per DOI wins), `ON DELETE CASCADE` chunks, purge, journals.
    - Search: `to_tsquery('simple')` text from `text/ts-query.ts` (stems `:AB`, folded word `:C`), `ts_rank('{0.05,0.25,0.5,1}', …, 1)`. The trigram top-up is `LIKE ANY` (bitmap index scan confirmed) plus `hasStemAtWordEdge`. Vector search runs in a transaction with `set_config` for `iterative_scan = strict_order`, `ef_search` 200 and `max_scan_tuples` 1e6.
    - `beginPostgresIndexBuild({pool, kind, now, dimensions, serverRole?}, signal)` returns `{kind, resumed, schema, store, commit(meta, signal), discard(signal)}`. Commit runs ANALYZE, writes the meta, grants `serverRole`, flips `live_index` (keeps the previous build, drops the one before it) and clears `index_build`. Builds take an advisory lock and run with `statement_timeout = 0`.
    - `verifyPostgresIndex(pool, schema, options, signal)`. `readLiveIndex(db)`.
  - `4784268` docs: package README, ticket ticks, ADR 0034 notes (weights halved because `ts_rank` takes weights up to 1; server grants are explicit at commit, not default privileges).
- **Verified:** `pnpm lint`, `typecheck` and `depcruise` are green. The suite has 1,421 tests (store-postgres alone 106, including the full article and sync state contracts and the SQLite German search cases) with 95.5% lines. `format:check` fails only on the local, gitignored `apps/landing/next-env.d.ts`. A scratch load of 20k synthetic chunks inserted in about 45 s (HNSW and GIN maintained per row). Vector queries took about 6 ms with HNSW under a year filter, lexical about 10 ms.
- **Gotchas:** `ts_rank` weights must be within 0..1 ("weight out of range"). A Python `str.replace` with the wrong indentation fails silently; assert that the pattern is present, or use Edit. `freshIndexStore()` (in `testing/index-schemas.ts`) shares one migrated database per test file and gives each test its own schema.
- **Next, in order:** steps 2-5 from session 14 are unchanged.
  - Step 2: async server index reader over `readLiveIndex` + `createPostgresIndexStore`, refreshed when `live_index.version` changes. Then `STORE` wiring, `ingest migrate`, and an abstraction over the two build APIs, because the ingest uses `build.db` and the sync `commit`/`close` on SQLite.
  - Step 3: compose profile.
  - Step 4: exit eval copy plus `eval golden` on both stores, and tuning `ts_rank` normalisation and `ef_search`.
  - Step 5: funnel view.
  - Consider creating the full-build indexes after loading if the exit copy is slow.

## 2026-11-03 - session 16, SM-13 step 2 done (async reader, storage port, STORE wiring)

- **Objective:** SM-13 "Next, in order" step 2 from sessions 14/15.
- **Done (committed on `main`):**
  - `ad80de7` code:
    - **Core ports.** `IndexReader` (async `refresh(signal)`, `close()`), `IndexStore` (the shared shape of both stores' index stores; `SqliteIndexStore`/`PostgresIndexStore` are now aliases), `IndexStorage` (`openLive`, `beginBuild`, `verifyLive`) with `IndexBuild` (`verify`, `commit`, `close` keeps for resume, `discard`) and `LiveIndexView` (`articleCount`, `store` only on the current layout, `dois()`). `BuildKind`, `VerifyOptions`, `PurgeCounts` moved to core. `storeConfigSchema` (`STORE`).
    - **Adapters.** `createSqliteIndexStorage(indexPath)`, async `openIndexReader(path, model, signal)`. `createPostgresIndexStorage({pool, serverRole})`, `openPostgresIndexReader(pool, model, signal)` (follows `live_index.schema_name`, refuses another model or layout). Testkit `runIndexStorageContract` (10 cases) passes on both.
    - **Server.** `createLiveIndex(open(signal), logger, {timeoutMs})`: async, single-flight refresh, 20 s timeout per tick, `close` waits for a running refresh. `runtime/open-server-stores.ts` picks SQLite files or a Postgres pool (`assertMigrated` at boot) for index, sessions, outbox, keys. The keys command uses `DATABASE_URL` as given (must be the writer).
    - **Ingest.** Every command goes through `IndexStorage` (`inBuild` closes on error, `verifyAndCommit`). `subset`/`reembed` take `source`/`target` storages; the CLI still wires both to SQLite files. `ingest migrate` parses only store and logging config (no Crossref vars needed); SQLite migrates the runtime file, Postgres runs `migrateDatabase` + `grantServerRole`.
    - **Eval.** `STORE` picks the reader; Postgres uses a 2-connection pool.
  - Docs commit: ADR 0034 decision 10 note, ticket tick, package READMEs.
- **Verified:** lint, typecheck, depcruise green; 1,443 tests, 94.8% lines; `format:check` fails only on the local `apps/landing/next-env.d.ts`.
  - **Live smoke** (throwaway `pgvector/pgvector:0.8.7-pg18-trixie` container, role `scholarly_server`): `ingest migrate` twice (idempotent); `verify` refuses with no index; a scratch script copied `data/eval-index.sqlite` (2,959 articles) into Postgres through `extractSubset` + both storages in 33 s, verified and committed; `ingest verify` passed; the server (`MCP_TRANSPORT=http`, server role) reported `/readyz` ready; a stdio `search_articles` via Inspector returned results and wrote a `tool_call` row to `scholarly.usage_events`; `keys create` worked as the writer and was refused (`permission denied for table api_keys`) as the server role.
  - **Early golden (not the exit run):** overall recall 0.665 vs SQLite 0.680, MRR 0.869 vs 0.888, nDCG 0.618 vs 0.627; `de` recall 0.536 vs 0.566 (3 points), `en` and `cross` within 1. Tune in step 4 (`ts_rank` normalisation, `ef_search`).
- **Gotchas:** run vitest and node only after `source ~/.nvm/nvm.sh && nvm use`; without it better-sqlite3 segfaults (SIGSEGV) in the worker. macOS has no `timeout`. The eval exits 1 without `--baseline` when recall is under the absolute 0.8 target, which SQLite also misses.
- **Next, in order:**
  - Step 3: `docker compose --profile postgres` (roles `scholarly_ingest` owner, `scholarly_server`; extensions created up front), Postgres guide, README roadmap and docs index, `migrate` in the ingestion guide.
  - Step 4: wire a copy command (`ingest copy --from <sqlite>` or `subset`/`reembed` with a Postgres target; the port already supports it, see the smoke script shape above), run `eval golden` on both, record the gap in ADR 0034, tune.
  - Step 5: funnel view.

## 2026-11-03 - session 17, SM-13 steps 3 and 4 done (compose, copy, exit eval)

- **Objective:** SM-13 "Next, in order" steps 3 and 4 from session 16.
- **Done (committed on `main`):**
  - `fix(server)`: the API key HTTP test used a fixed 10:00 UTC clock; the SDK checks token expiry against the wall clock, so it failed every run after 11:00 UTC. Now uses the current time.
  - `feat(store-postgres)`: lexical rank = sum of each word's `ts_rank` (weights 1/0.5/0.25, normalisation 0) times its BM25 IDF; per-build `term_stats` (lexeme, chunks) filled by `ts_stat` at commit (`INDEX_LAYOUT_VERSION` 2, so older schemas need `full` or `copy`); only words in at most 5 % of chunks (`COMMON_WORD_SHARE`) pick candidates; `ef_search` 400. Pure `queryWords`/`weighWords` in `text/ts-query.ts`.
  - `feat(ingest)`: `ingest copy --from <sqlite index>` into the store `STORE` picks, with embeddings and sync state; drops a leftover target build first; needs every article to arrive (`minArticleCount`).
  - `feat(docker)`: root `compose.yaml`, profile `postgres` (pgvector 0.8.7-pg18, `127.0.0.1:${PG_PORT:-5432}`, `maintenance_work_mem` 512MB); `docker/postgres/init/01-roles-and-extensions.sh` creates db `scholarly` owned by `scholarly_ingest`, `scholarly_server` with CONNECT only, both extensions. Passwords default to `ingest-local`/`server-local`.
  - Docs: new `docs/guides/postgres.md`, docs index, README scripts, roadmap SM-13 🚧, app READMEs (`STORE`, `migrate`, `copy`), ingestion guide, ADR 0034 decisions 3 and 4 plus an "Exit eval" section, ticket ticks and exit result.
- **Exit eval:** golden overall Postgres 0.684/0.881/0.633 vs SQLite 0.680/0.888/0.627 (recall/MRR/nDCG); first cut was 0.665/0.869/0.618. Full corpus (176k chunks) bench p50/p95 Postgres 68/259 ms vs SQLite 221/312 ms (first cut 226/748). Copying the full corpus takes about 8 min, the eval index 35 s.
- **How the gap was found:** a scratch script mixing one store's lexical with the other's vector search (deleted; easy to redo against `createSearchService` with a hand-built `ArticleSearch`).
- **Local state:** the compose Postgres (`PG_PORT=55432`, volume `scholarly-mcp_postgres-data`) holds the full corpus as live and the eval index as previous. `docker compose --profile postgres down -v` removes it.
- **Gotchas:** zsh does not word-split `$VAR` env prefixes; use a bash script. Turbo's lint output shows only `build:packages`; eslint runs after it.
- **Next, in order:**
  - Step 5: live funnel view over Postgres events (SM-12 follow-up), then close SM-13 (board, README roadmap ✅).

## 2026-11-03 - session 18, SM-13 done (live funnel, step 5)

- **Objective:** SM-13 step 5 from session 17 (live funnel over Postgres events), then close SM-13.
- **Shape decided (ADR 0035, no owner decision needed):** read the outbox's stored events and count with the existing TypeScript rules (no SQL copy of `computeFunnel`); serve from a separate `funnel --serve` process on loopback, not a route on the public MCP server, which has no operator login.
- **Done (committed on `main`):**
  - `7d24965` store: `UsageOutbox.list({from, to, apiKeyId, after, limit})` in `(occurred_at, id)` order, ids in byte order; SQLite runtime migration 5 and Postgres runtime migration 3 add the `(occurred_at, id)` index; core `readUsageEvents` (keyset paging, 1000 per page) and `createFunnelCounter` (streaming counter behind `computeFunnel`); outbox contract cases for filters, paging and byte-order ties; fake and both stores implement it.
  - `b867def` server: `funnel --store --out … [--json …]` and `funnel --store --serve [--host 127.0.0.1 --port 8092 --refresh 60]` (`GET /`, `GET /funnel.json`, `?since=&until=&key=`; a count is reused per filter set for the refresh time and shared between requests; 503 on a failed read, not cached; `meta refresh`, CSP `default-src 'none'`). `openFunnelStore` in `runtime/open-server-stores.ts` (SQLite file must exist; Postgres works as the server role). Shared `funnel-filters.ts`; `serveHttp` takes an optional `name` for its log. Export lines now stream through the counter.
  - `516a248` docs: ADR 0035, funnel guide (from the store, the live view), Postgres and operating guides, ADR index (0034 was missing, added with 0035), ADR 0033 note, server and store-postgres READMEs, docs index (`ADAPTERS.md` belongs to SM-14), ticket ticked, board and README roadmap SM-13 ✅.
- **Verified:** lint, typecheck, depcruise green; 1,479 tests, 94.74% lines; `format:check` fails only on the local `apps/landing/next-env.d.ts`. Live against the compose Postgres: `ingest migrate` applied migration 3; `EXPLAIN` uses `usage_events_by_time`; 1,502 events appended through the Postgres outbox as `scholarly_server` (two pages, many equal timestamps) counted once each by `--store`; `--serve` answered HTML and JSON, 400 on a bad day, and exited 0 on SIGINT. The smoke rows were deleted again.
- **Gotchas:** a SIGINT listener registered up front keeps Ctrl+C from ending a one-shot command, so `untilStopped` registers its listeners only when `--serve` asks. Postgres row comparison on the `C`-collated id needs `COLLATE "C"` on the bound parameter to stay explicit.
- **Still open for the user:** the Claude Desktop manual check (SM-09/SM-12).
- **Next:** SM-14 (hardening, image and docs; includes `ADAPTERS.md`, `OPERATIONS.md`, `SECURITY.md`; the shared rate-limit store and citation fields from the README's known limits).

## 2026-11-03 - session 19, SM-14 steps 1-4 done

- **Objective:** SM-14, worked in the order of the "Plan (session 19)" section in `tickets/SM-14-hardening-docs.md` (11 steps).
- **Done (committed and pushed on `main`):**
  - `317bd49` plan in the ticket.
  - Step 1 `4e65548`: `volume`, `issue`, `pages` on `Article` (free-form strings), Crossref `volume`/`issue`/`page` via `map-issue-locator.ts`, CSL `volume`/`issue`/`page`; AMA now prints `2024;124(S 01):e12-e20`.
  - Step 2 (part) `4bd5155`: `presets/thieme.subjects.json` (216 journals, all ISSNs, English labels, MeSH names where one fits), core `journal-subjects.ts` (`journalSubjectsPresetSchema`, `journalSubjectsOf`, `withJournalSubjects`), ingest `JOURNAL_SUBJECTS_FILE` (set in `presets/thieme.env`) loaded by `config/load-journal-subjects.ts`; used only when Europe PMC gave no MeSH/keywords. ADR 0004 implementation note.
  - Step 3 `87872d0`, `9a88752`: ADR 0036. Core `RateBucketStore` port, token-bucket maths moved to core (`takeToken`, `retryAfterSeconds`, `refillMs`), testkit `runRateBucketStoreContract`, server `createMemoryBucketStore` (LRU 10k) and async `createRateLimiter({store, name, …})` (fails open with a warning, `sweep` every minute), Postgres `createPostgresBucketStore` (one upsert statement, runtime migration 4: UNLOGGED `scholarly.rate_buckets`, granted to the server role). Shared whenever `STORE=postgres`. README limitation row removed.
  - Step 4 `a9fee04`, `4548be8`, `f3e35c2`: ADR 0037, `docker/README.md`. `METRICS_PORT`/`METRICS_HOST` internal `/metrics` listener (public port then 404s it). `docker/server/Dockerfile` (build on `node:24.22.2-trixie-slim`, run on `gcr.io/distroless/nodejs24-debian13:nonroot`; model baked in `/models`; `prune.sh` drops other-platform ONNX/sharp binaries and onnxruntime-web wasm; 744 MB unpacked, ~196 MB compressed), entrypoint `docker/server/scholarly-mcp.mjs` (`serve`|`keys`|`funnel`|`ingest`), index baked via `--build-context index=<dir>` (compose `INDEX_DIR`). `compose.yaml` profiles `sqlite` (server), `postgres` (postgres, one-shot migrate, server-pg), `tools` (ingest). Verified: read-only FS, uid 65532, ready 1.8 s on the eval index, ~560 MiB, SIGTERM exit 0, `/metrics` 404 publicly, keys and `ingest verify` through the entrypoint, Postgres profile migrated to 4 and healthy on the full corpus.
  - `ffaca8f`: a rebuild now reuses embeddings when title, subtitle, abstract, language and the full-text ref are unchanged (not just the whole content hash), so metadata-only changes do not re-embed.
- **Running:** the planned full rebuild (`data/ingest-sm14b.log`, resumed after 4 re-embedded pages, now reusing; ~30 min from 15:15). When done: check the log ends with "Index swapped in" and `verify` ok; spot-check an article has `volume` and journal subjects; then tick the ticket's citation task and remove the README "Citations without volume, issue and pages" row; rebuild the eval index if the golden set should carry the new fields (`ingest subset`).
- **Blocked on the user:**
  - **Journal URL:** thieme-connect answers scripts with a JavaScript bot challenge, so no ISSN URL could be verified (not bypassed). The user should open e.g. `https://www.thieme-connect.de/products/ejournals/issn/0936-5214` in a browser; if it shows the Synlett journal page, set `JOURNAL_URL_TEMPLATE=https://www.thieme-connect.de/products/ejournals/issn/{issn}` in `presets/thieme.env`.
  - **Prebuilt index in a public image:** the index holds abstracts and matching-only full-text chunk text (ADR 0003); publishing it in a public GHCR image redistributes that content. Needs an owner decision before the release workflow bakes it in. Options: private image; public image without index plus `ingest full` (hours); a small public demo index of CC BY articles only.
- **Next, in order:** step 5 landing image (`output: 'standalone'` behind a build flag, compose `landing` service with `LANDING_API_SECRET`, proxy `x-forwarded-for`), 6 E2E smoke script, 7 load test and fuzzing, 8 CI security scans, 9 release workflow, 10 docs, 11 exit check.
- **Gotchas:** zsh does not word-split `$VAR` command prefixes; put docker commands in bash scripts. No `timeout` binary on macOS. Foreground `sleep` is blocked; use Monitor or background tasks. The prod install in the Dockerfile must drop the root `prepare` (husky). Copy `package.json` before `pnpm fetch`, or corepack picks a newer pnpm. `format:check` still fails only on the local `apps/landing/next-env.d.ts`.

## 2026-11-03 - session 20, SM-14 step 1 closed, step 5 done

- **Objective:** confirm the SM-14 full rebuild, finish step 1, then step 5 (landing image).
- **Done (committed and pushed on `main`):**
  - `7758be5` step 1 closed. Rebuild `data/ingest-sm14b.log` ended with "Index swapped in" and `verify` ok: 70,989 articles, 176,536 chunks, 80 re-embedded, rest reused. Volume on 67,529, issue on 67,377, pages on 66,102; every article has subjects (57,379 from the journal preset). Ticket ticked, README "Citations without volume, issue and pages" row removed.
  - Same commit, owner answers: the thieme-connect ISSN URL answers "No articles available" (owner's browser), so `JOURNAL_URL_TEMPLATE` stays unset (ticket ticked, ADR 0025 note). Index in the public image: delegated to us; decided a public image carries only a small CC BY 4.0 demo index, never the full index (abstracts, CC BY-NC-ND chunks); recorded in the ticket's step 9, ADR due with step 9.
  - `4cb2cb0` core `withSecretFiles(env, names, read)` (`<NAME>_FILE` for listed secrets: server `LANDING_API_SECRET`, `METER_WEBHOOK_SECRET`, `DATABASE_URL`; ingest `DATABASE_URL`; landing `LANDING_API_SECRET`). Server `LANDING_API_PORT`/`LANDING_API_HOST`: landing API on its own listener, public port 404s it; secret and Host allowlist required by where the landing listener binds.
  - `0239f78` `LANDING_STANDALONE=true` (turbo env) builds standalone; `docker/landing/Dockerfile` (distroless nonroot, own `Dockerfile.dockerignore`), `docker/landing/Caddyfile`, compose `landing` profile (app + `caddy:2.10.2-alpine` proxy), internal networks `landing-api` and `landing-proxy`, server alias `server`, landing secret as compose secret (`LANDING_API_SECRET_PATH`, default committed local-only file).
  - `b37623a` ADR 0038, docker README, landing and operating guides, ADR 0032 note, ticket ticked.
- **Verified:** 1,529 tests, lint, typecheck, depcruise green; `format:check` fails only on local `apps/landing/next-env.d.ts`. Compose sqlite+landing: page 200 via proxy (~80 ms, eval index in the `index` volume), unknown DOI 307 to doi.org, public `/landing/v1/` 404, landing port 401 without secret, app has no internet, 45 forged-XFF requests share one bucket (429 fallback after burst), read-only, uid 65532, landing 306 MB / ~77 MB compressed, ~120 MiB resident.
- **Gotchas:** another local app listens on IPv6 `*:3000`; test the proxy at `127.0.0.1:3000`, not `localhost`. The compose `index` volume holds the eval index (2,959 articles), so pick DOIs from `ingest verify`. Next standalone exits 143 on SIGTERM (no drain; noted in ADR 0038). The eval index was not rebuilt with the new citation fields (optional `ingest subset`).
- **Still open for the user:** the Claude Desktop manual check (SM-09/SM-12).
- **Next, in order:** 6 E2E smoke script (compose up incl. landing, key, every tool over HTTP, CI), 7 load test and fuzzing, 8 CI security scans, 9 release workflow (with the CC BY demo index ADR), 10 docs, 11 exit check.

## 2026-11-03 - session 21, SM-14 steps 6-10 done, step 11 pending the v0.1.0 release

- **Objective:** SM-14 steps 6 to 11 in order (`tickets/SM-14-hardening-docs.md`).
- **Done (committed and pushed on `main`, `4c04031`..`89b2bc0`):**
  - Demo index (ADR 0039, also the step 9 index decision): `INGEST_DOIS_FILE` makes the Crossref source look up only listed DOIs (batches of 20, list cursor); `presets/thieme.demo-dois.txt` lists 214 CC BY 4.0 articles (two per journal, 54 German, 138 with full text); `docker/demo-index/build.sh <dir>` runs `ingest full` in the image with a CC BY-only full-text allowlist, then checks every article and chunk licence with sqlite3. Built: 214 articles, 3,235 chunks, 30 MB, about 12 min (Europe PMC is the slow part).
  - Step 6: `docker/e2e/smoke.sh [sqlite|postgres]` + `smoke.mjs` (13 checks: readyz, 401, hidden /metrics and landing API, initialize, tools/list, all six tools, card link via the proxy, doi.org fallback). Both stores pass locally (Postgres run 94 s with a prebuilt index via `SMOKE_INDEX_DIR`). CI job `e2e` builds the demo index once and runs both.
  - Step 7: `apps/server/src/http/http-edge.fuzz.test.ts` (fast-check: HTTP edge, JSON-RPC, tool args). `docker/e2e/load.sh` + `load.mjs` (autocannon). Results in `docs/OPERATIONS.md#capacity`: Postgres 20/s at p50 74 / p95 299 ms (server 2 vCPU, Postgres 4 vCPU; the server uses ~15% of a CPU); SQLite tops out near 4.4/s (about 200 ms synchronous CPU per search, mostly the exact vector scan). New ticket SM-17 for SQLite throughput.
  - Step 8: `.github/workflows/security.yml` (osv-scanner, Trivy image + config, Semgrep, gitleaks, SPDX SBOM), `.github/dependabot.yml` (7-day cooldown), all actions pinned by commit, tools by digest; `.gitleaksignore` (5 test-fixture fingerprints), `.semgrepignore` (spikes), `osv-scanner.toml` (4 dev-only advisories, expire 2027-02-01); pnpm 10.34.7 with `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`.
  - Step 9: `.github/workflows/release.yml` (tag `v*.*.*`: demo index, smoke both stores, multi-arch push to GHCR, provenance, SBOM on the release).
  - Image: defaults `AUTH_MODE=api-key`, `HTTP_ALLOWED_HOSTS=localhost,127.0.0.1`, `LANDING_API_PORT=8081` (loopback); entrypoint applies `presets/$SCHOLARLY_PRESET.env` (default `thieme`) under explicit settings (ADR 0037 note). A bare `docker run` is ready in about 2 s and answers with a key.
  - Step 10: README in plan order (quick start = `docker run` + `claude mcp add`), new `docs/OPERATIONS.md`, `docs/ADAPTERS.md`, `docs/SECURITY.md`; landing guide moved to `docs/LANDING.md`; docs index and docker README updated; SM-14 tasks all ticked.
- **Verified:** 1,546 tests, coverage 93.8%, lint, typecheck, depcruise green (`format:check` still only the local `apps/landing/next-env.d.ts`); actionlint and shellcheck clean; locally gitleaks, Semgrep, osv-scanner, Trivy image and config scans clean.
- **First CI run after the push failed and was fixed in `3fc9b21`, `89b2bc0`:** setup-node v5 auto-caching needs pnpm (off in node-only jobs); Trivy DS-0031 false positive on `AUTH_MODE` (inline `trivy:ignore`). The re-run was in progress at handoff.
- **Owner approved** pushing tag `v0.1.0` once CI and Security are green (2026-11-03).
- **Next, in order:** confirm CI + Security green on `89b2bc0`; push tag `v0.1.0`; watch `release.yml`; check the GHCR packages are public (anonymous `docker pull`; if private, the owner sets visibility in package settings); then step 11: fresh clone to working server with the README quick start, timed, under 5 minutes; record it in the ticket, mark SM-14 done in `tickets/README.md` and the README roadmap.
- **Open for the owner:** the Dependabot npm update fails (log needs write access: repo Insights > Dependency graph > Dependabot); Dependabot PRs #1 (actions group) and #2 (caddy 2.11.6) are open, unreviewed; the Claude Desktop manual check (SM-09/SM-12); the README's 30-second GIF comes with SM-15.
- **Gotchas:** a local Postgres volume `scholarly-mcp_postgres-data` holds the full corpus (used for the load test). Demo index copy at the session scratchpad only; rebuild with `docker/demo-index/build.sh`. Foreground `sleep` is blocked; poll GitHub runs in a background loop.

## 2026-11-03 - session 21 (cont.), SM-14 done, v0.1.0 released

- CI and Security green on `89b2bc0` (incl. `e2e` on both stores). Tag `v0.1.0` pushed with the owner's approval; `release.yml` passed in 28 min (demo index + smoke 15 min, multi-arch builds 13 min). Images `ghcr.io/sami3ullah/scholarly-mcp` and `-landing` (`0.1.0`, `0.1`, `latest`) pull anonymously; SBOMs on the GitHub release.
- Step 11 exit met: README `docker run` quick start answered a tool call 104 s from no cache (mostly the pull); fresh clone + compose with the landing app + 13 smoke checks 38 s more. SM-14 marked done; SM-17 added to the README roadmap.
- **Next:** SM-15 (needs owner decisions) or SM-17. Still open for the owner: the Dependabot npm updater error (log needs write access), Dependabot PRs #1 and #2 (and later ones), the Claude Desktop manual check, `gh attestation verify` not run here (no `gh` CLI locally).

## 2026-11-03 - session 22, SM-17 steps 1 and 3 done, exact scan 4x faster

- **Objective:** SM-17 (`tickets/SM-17-sqlite-search-throughput.md`): profile a full-index SQLite search by stage, pick the fix with an ADR, load test at 20 calls/s on 2 vCPUs.
- **Done (pushed, `7b87710`..`fb207cc`):** profile recorded in ADR 0040 (vector scan 174 of 200 ms: scalar `vec_distance_cosine`, SQLite page copies, the `distance < 1` alias computed twice; FTS5 21 ms; embedding 2 ms). Fix: `vec_distance_l2` (SIMD; cosine order for unit vectors), cut-off √2 − 1e-6 applied after the top-k, `mmap_size` 2 GiB on read-only opens; `chunkSchema` now refuses non-unit embeddings, `aChunk` normalises, the zero-vector verify tests moved to `packages/core/src/indexing/verify-report.test.ts`, contract test for the cosine-0 cut-off. Search 200 → 50 ms natively. Golden set equals the baseline exactly. `load.sh` takes `LOAD_CPUS`.
- **Load at 20/s, full index:** before 4.4/s served, p95 3,527 ms, 13 `TIMEOUT` (2 vCPUs); after 12.5/s, p95 1,103 ms, 5 `TIMEOUT` (2 vCPUs), 13.0/s with no CPU limit. In the Linux image the L2 scan is 65 ms against 29 ms natively. The single event loop is now the ceiling.
- **Next:** ADR 0041, search on a pool of worker threads, each with its own read-only connection (lexical + vector; reader lookups are under 1 ms and can stay on the main thread); workers reopen on `refresh()` and the main swaps after they ack; worker entry is `dist/…` (tests run after `pnpm build:packages`), keep its logic in a tested function. Then rebuild `scholarly-mcp:sm17` and rerun `LOAD_CPUS=2 docker/e2e/load.sh data scholarly-mcp:sm17`; record in OPERATIONS.md, the ticket and ADR 0040's consequences.
- **Gotchas:** scratch scripts in the session scratchpad `sm17/` (profiler needs to sit under `apps/eval` to resolve workspace packages; delete before committing). Memory after a SQLite load run is ~1.3 GiB (mapped file cache).

## 2026-11-03 - session 22 (cont.), SM-17 worker pool done, exit pending an owner decision

- **Done (pushed, `0a51e6f`, `c0ce88f`):** ADR 0041. `openIndexReader(..., { searchWorkers })` runs lexical + vector searches on worker threads (`packages/store-sqlite/src/search/search-pool.ts`, `search-worker.ts`, logic in `search-worker-state.ts`); `refresh()` reopens the workers before swapping the main connection. `SQLITE_SEARCH_WORKERS` (default 2, 0 = event loop; eval and ingest use 0). `load.sh` passes `SQLITE_SEARCH_WORKERS` on. Tests 1,558, coverage 93.8%.
- **Load at 20/s, 2 vCPUs, full index:** 2 workers 19.4/s, p50 344, p95 517, p99 900 ms, 1 `TIMEOUT` / 1,167; 3 workers 19.8/s, p95 525; 1 worker 12.8/s. Capping ONNX threads (1 or 2) changed nothing, so it was not kept. CPU-bound now.
- **Exit not strictly met** (p95 at the 500 ms line). Ticket has an open task; board says "in progress, owner decision".
- **Next:** ask the owner whether to compile sqlite-vec from pinned source with NEON (arm64) / AVX (amd64) in the image (the Linux L2 scan is 65 ms against 29 ms on macOS, which fits a scalar build); if yes, add a build stage, load that `.so` instead of the npm one, rerun `LOAD_CPUS=2 docker/e2e/load.sh data scholarly-mcp:sm17`. If no, close SM-17 with the stated ceiling (20/s needs 3 vCPUs on SQLite). CI on `c0ce88f` not checked here (no `gh` CLI locally).

## 2026-11-03 - session 23, SM-17 done with SIMD sqlite-vec

- **Owner decision:** yes, compile sqlite-vec from pinned source in the image. CI on `c3726ab` was green (CI and Security).
- **Done (pushed, `1a2cf9b`, `92478f4`):** ADR 0042. Cause confirmed in upstream's Makefile: NEON/AVX only when `uname -sm` is Darwin, so the npm Linux `vec0.so` is scalar. New `sqlite-vec` Dockerfile stage compiles the 0.1.9 amalgamation (`ADD --checksum`) with `-DSQLITE_VEC_ENABLE_NEON -flax-vector-conversions` (GCC rejects the NEON int8 kernels without it) or `-mavx -DSQLITE_VEC_ENABLE_AVX`; `docker/server/sqlite-vec.sh` overwrites the platform package's `vec0.so` after a version check. No code change.
- **Results (arm64 image):** scan 65.8 → 32.5 ms; load at 20/s, 2 vCPUs, 3 runs: 19.6-19.9/s, p50 ~220, p95 346-361, p99 618-1,122 ms, 0 `TIMEOUT`. Top 50 identical to the scalar build for 100 queries. amd64 image built and smoke-tested under emulation (`vec_distance_l2` correct). SM-17 marked done on the board and the README roadmap; OPERATIONS capacity updated.
- **CI:** green on `870fa2f` (CI incl. e2e on the amd64 AVX image, and Security).
- **Next:** A future sqlite-vec bump must change `SQLITE_VEC_VERSION` and the checksum in `docker/server/Dockerfile` with the lockfile; the image build fails otherwise. Then SM-15 (needs user decisions).

## 2026-11-03 - session 24, SM-15 owner decisions recorded

- **Owner decisions** (in `tickets/SM-15-demo-outreach.md`): no hosted demo; the owner runs it locally and Thieme gets a self-hosting guide (Docker Compose, deployable on AWS, Cloudflare or a plain VM, adoptable with an existing Postgres). Per-user keys documented in the guide. Local demo and Loom use the full Thieme index. The agent picks specialties and proposes 5 demo questions for approval. Repo stays `sami3ullah/scholarly_mcp`. Ticket tasks and exit rewritten to match (the plan's "public URL stable for 7 days" is dropped).
- **Next:** (1) query the full local index for specialties with DE + EN coverage, a paywalled hit and a retraction; propose 5 questions to the owner. (2) ADR for the self-hosting shape: Compose with Caddy TLS; SQLite default; Postgres bundled or external (needs `vector` and `pg_trgm`, roles from `docker/postgres/init/01-roles-and-extensions.sh`); Cloudflare means Tunnel in front of a VM (no persistent volume or 1+ GiB model on Workers); AWS means EC2 + Compose, or ECS + RDS Postgres (pgvector supported). (3) `docs/SELF-HOSTING.md`, verified on a clean machine against SQLite and an external Postgres.

## 2026-11-03 - session 25, SM-15 demo questions approved, paywall badge and both-language search

- **Owner decisions:** the 5 demo questions are approved (recorded in `tickets/SM-15-demo-outreach.md`, gastroenterology; retraction question uses 10.1055/a-2458-7088). Owner asked that cards show paywalled articles as paywalled and that `language: any` return both languages.
- **Done (pushed, `3d881f9`..`39b8ae5`):**
  - ADR 0043: card `access` is `open` or `subscription` from `isOpenAccess` (57,844 closed records carry no licence; every OA record has a CC licence). Schemas keep `unknown`.
  - ADR 0044: without a language filter the vector side runs in a German lane and a non-German lane (`SearchFilters.excludeLanguage`); vector hits more than 0.055 below the best are dropped (`VectorChunk.similarity`, both stores); lexical runs once; the other lane's best meaning-related result moves into the first 5 (`mixLanes`). SQLite index `vec_chunks_by_language`, added on every build commit (no schema bump). Golden 0.680/0.888/0.627 -> 0.710/0.900/0.646, cross recall 0.600 -> 0.655; baseline rewritten. Load at 20/s on 2 vCPUs: 19.7-20.0/s, p95 408-436 ms, 0 timeouts (OPERATIONS updated).
- **Verified:** 1,584 tests, 133 Postgres contract tests, lint, typecheck, eval gate on push. CI on `39b8ae5` not checked here (no `gh` CLI).
- **Gotchas:** the local full index `data/index.sqlite` lacks `vec_chunks_by_language` until its next ingest build (works, German lane slower). Rejected variants and their numbers are in ADR 0044.
- **Open idea (not asked):** `search_articles` with a retracted DOI returns nothing and no hint; a hint pointing to `get_article`/`cite` would help.
- **Next:** SM-15 step 2, ADR for the self-hosting shape, then `docs/SELF-HOSTING.md` verified on a clean machine (SQLite and external Postgres).

## 2026-11-07 - session 26, SM-15 self-hosting bundle, guides, memo; CI fixes

- **Objective:** everything on SM-15 the agent can do, then hand the owner their steps.
- **Done (pushed, `e0e18d9`..`88e7c94`):**
  - ADR 0045 and `deploy/` (compose, Caddyfile, `.env.example`, `secrets/`): published images behind Caddy on one hostname (TLS by Let's Encrypt; `/mcp`, `/healthz`, `/readyz`, OAuth metadata to the server, the rest to the landing app), `STORE=sqlite` default, bundled Postgres (`COMPOSE_PROFILES=postgres`) or your own (`DATABASE_URL`, `ADMIN_DATABASE_URL`), `init` runs `ingest migrate` on every `up`, `admin` runs keys/ingest/funnel as the writer, `cloudflare` profile for a tunnel. Caddy runs as root with all caps dropped except `NET_BIND_SERVICE` (its binary has a file cap; without it exec fails), listens on 8080/8443.
  - `docker/e2e/deploy-smoke.sh [sqlite|postgres]` (13 smoke checks over HTTPS via Caddy, `PUBLIC_HOST=localhost`), in the CI `e2e` job after `smoke.sh`. Dependabot watches `/deploy`.
  - `docs/SELF-HOSTING.md`, `docs/CONNECTORS.md`, `docs/outreach/memo.md` (Loom link and contact to fill), `docs/outreach/loom-script.md`. README recall row updated (0.71 / 0.66 cross).
  - Local `data/index.sqlite` refreshed by `ingest incremental`: 71,197 articles, now with `vec_chunks_by_language`.
  - CI on `63f7cb4` failed for two outside reasons, fixed: Trivy HIGH zlib CVE-2026-85091 in the distroless base (Node bundles its own zlib; `.trivyignore` expires 2026-11-28); demo DOI 10.1055/a-2917-0294 lost its Crossref licence, replaced by 10.1055/a-2891-6315 (ADR 0039 note). Demo index rebuilt locally: 214 articles, all CC BY.
- **Verified locally:** bundle from a clean copy on SQLite, bundled Postgres, and a separate Postgres prepared with the guide's role SQL alone: 13/13 each; tunnel settings serve HTTP on loopback; keys, `funnel --store --json /dev/stdout`, runtime backup via `node:sqlite` work.
- **Owner steps (SM-15 open):** approve tag `v0.2.0` (bundle defaults to `SCHOLARLY_VERSION=0.2.0`; v0.1.0 lacks ADRs 0042-0044); record the Loom; send outreach. Older: Claude Desktop manual check, Dependabot npm error and PRs #1/#2.
- **Open questions for the owner:** accept API keys and OAuth in one deployment (ChatGPT and most claude.ai orgs need OAuth); a hint when `search_articles` gets a retracted DOI.
- **Gotchas:** `gh` is not installed; CI status via `curl https://api.github.com/repos/sami3ullah/scholarly_mcp/actions/runs?head_sha=…` and `/actions/runs/<id>/jobs` (logs need auth). mcp-inspector v2 changed its CLI flags; the guide uses `smoke.mjs` run in the image instead.
- **Owner decision (2026-11-07): nothing paid.** The demo runs only in Docker locally; the real-VM check is dropped (ticket exit rewritten). Demo stack is up: `INDEX_DIR=$PWD/data/demo-full docker compose --profile sqlite --profile landing up -d --wait` (full index hard-linked at `data/demo-full/index.sqlite`, 71,197 articles; the old eval `scholarly-mcp_index` volume was removed so the image seeds it). Demo key in `data/demo-full/demo-key.txt` (gitignored). 13/13 smoke checks on it.

## 2026-11-07 - session 27, owner trying the local demo; two fixes

- **Owner report:** the MCP failed with "Dynamic Client Registration rejected (HTTP 404)" and the landing showed "This link is no longer available".
- **Causes:** the MCP was added without the `Authorization` header, so Claude Code fell back to OAuth (re-added with the demo key, now connected). The landing root rendered the expired-link 404 copy; card links from a real search work.
- **Done (pushed, `181b241`, `4a1ed8b`):** app-wide not-found now says "There is no article here" (landing links keep the expired copy; e2e test for `/`). The image sets `METER_JSONL_PATH=/var/lib/scholarly/usage.jsonl`: the relative default could not be created on the read-only root, so every usage export failed and events stayed in the outbox. `smoke.sh` now fails if no usage events reach the file. Demo stack rebuilt and verified.
- **Next:** owner records the Loom; `v0.2.0` tag still awaits approval (the deploy bundle needs it for the meter fix too). CI on `4a1ed8b` not checked.

## 2026-11-08 - session 28, public server (ADR 0048), v0.2.0 release

- **Context:** after session 27 the owner restyled the card view and landing page (`00a3e2e`..`871610e`, ADR 0046).
- **Owner decisions (2026-11-08):** release v0.2.0 (approved). The MCP must be public, anyone connects without a key; remove API key and OAuth logic entirely ("dead simple"); rate limit if cheap. An `AUTH_MODE=api-key+oauth` mode was built first (`5ab9add`, ADR 0047) and superseded the same day.
- **Done (pushed, `4374af9`..`316899f`):** ADR 0048. Removed auth verifiers, `keys` command, `ApiKeyStore`, `Caller`/`apiKeyId` (usage events, landing sessions, funnel per-client table and `--key`), `UNAUTHORIZED`, `auth_failures_total`, PRM route. Runtime migrations drop `api_keys` and `api_key_id` (SQLite 6, Postgres 5). Per-client rate limit: `apps/server/src/limits/client-limit-key.ts` (HMAC of address under an in-memory secret, IPv6 /64), client address resolved in `serveHttp` via `apps/server/src/http/client-address.ts` with `HTTP_TRUSTED_PROXIES` (bundle trusts private ranges). Scripts, deploy bundle and all docs updated; smoke is 12 checks now.
- **Verified:** 1,540 tests (incl. Postgres via testcontainers), coverage 94.1%, lint, typecheck, depcruise, format. Local demo stack rebuilt on the new image: runtime DB migrated to v6 in place, 12/12 smoke checks, burst of 20 then `RATE_LIMITED` with `retryAfter`, no client IPs in logs.
- **Next:** if CI on `316899f` is green, push tag `v0.2.0` and watch `release.yml` (~30 min); confirm images pull anonymously. Owner: Loom, outreach, Claude Desktop check, Dependabot items. The owner's Claude Code MCP entry may still send the old demo key header; it is ignored now and can be removed (`data/demo-full/demo-key.txt` is obsolete).

## 2026-11-08 - session 29, UI trims and agent setup guide

- **Owner requests:** drop the arrow icons from the landing buttons; drop the "All results on one page" link from the card view; README setup in two paths, manual and through a coding agent.
- **Done (pushed, `0b7bc70`..`346f295`):** `ButtonLink` has no icon; the card view ignores `collectionUrl` (structured content and the plain-text rendering still carry it). New `docs/guides/agent-setup.md` (steps an agent follows: Docker check, port check, `docker run`, `/readyz` wait, `tools/list` check, client registration for Claude Code, Cursor, VS Code, Claude Desktop via `mcp-remote`); README quick start split into "Set up with your agent" (a paste-in prompt pointing at the raw guide) and "Set up manually".
- **Not done:** the local demo stack still runs the old images; rebuild to see the UI changes. The card view's "Read on" button keeps its arrow (not asked).
