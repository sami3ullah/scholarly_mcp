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
