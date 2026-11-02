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
