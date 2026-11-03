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
