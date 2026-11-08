# AGENTS.md

scholarly-mcp is an MCP server that lets AI assistants search a scholarly publisher's journals and link readers to the articles. The Thieme preset is the reference configuration. It indexes Crossref metadata and Europe PMC open-access text into SQLite (default) or Postgres, and serves six tools: `search_articles`, `get_article`, `find_related`, `get_journal`, `cite`, `check_access`. It also ships a Next.js landing app and a funnel report. It is an independent prototype, not affiliated with Thieme.

Read `docs/ARCHITECTURE.md` for the design and `docs/adr/README.md` for the decisions behind it before changing behaviour.

## Setup and commands

Node 24 (`.nvmrc`) and pnpm 10. Run `source ~/.nvm/nvm.sh && nvm use` first in a fresh shell.

```bash
pnpm install --frozen-lockfile
pnpm check                      # format, lint, types, layering, unused code, tests with coverage
pnpm test                       # all Vitest projects
pnpm exec vitest run packages/search   # one package or file
pnpm ingest full                # build an index; needs a preset env (docs/guides/ingestion.md)
pnpm eval golden                # search relevance on the golden set (docs/guides/evaluating-search.md)
pnpm landing dev                # landing app on :3000
```

Postgres tests start a container via Testcontainers, so they need Docker. `docker/e2e/smoke.sh sqlite|postgres` runs the full stack end to end.

## Layout

- `packages/core`: domain types, ports (interfaces), config schemas, errors. Pure: zod and the standard library only.
- `packages/source-*`, `store-*`, `embedder-onnx`: adapters that implement core ports.
- `packages/search`, `lexical`, `cite`, `card-view`, `http`, `logger`: services and shared pieces.
- `packages/testkit`: builders, port contract suites, the golden set.
- `apps/server` (MCP server, landing API, funnel), `apps/ingest`, `apps/eval`, `apps/landing` (Next.js).
- `presets/`: publisher presets. `deploy/`: self-hosting bundle. `docker/`: images and end-to-end scripts.

## Rules that are never broken

- Official APIs only (Crossref, Europe PMC). No scraping.
- No article content leaves the server beyond the 280-character teaser and the link.
- Query text never goes into URLs, logs, metrics or stores.
- No Thieme logo, and no claim of affiliation or endorsement.

## How code is written here

- Dependencies point inward. `pnpm depcruise` enforces the layering in `.dependency-cruiser.cjs`; apps never import each other.
- Factories that take their dependencies (`createSearchService({ ... })`), not classes. Only an app's `main.ts` creates concrete adapters. Clock and randomness are injected.
- Validate with zod at the edges (config, HTTP, source records, tool input and output) and trust the types inside.
- One concept per file, kebab-case file names, named exports, one `index.ts` per package. Strict TypeScript: no `any`, no `@ts-ignore`.
- Errors are `AppError` with a stable `code`, mapped to MCP errors in one place. Every I/O call takes an `AbortSignal`. Log with the logger package, never `console.log`.
- Comments explain why. Every exported function and port has TSDoc.
- Tests describe behaviour in sentence-style names. Use testkit builders, not large fixtures. No network in unit tests; recorded fixtures for adapters. A new adapter must pass its port's contract suite.
- Landing app: Server Components by default, thin route files, logic in hooks or `server/`, presentational components, CSS Modules.
- `pnpm knip` must stay clean: delete unused files, exports and dependencies instead of keeping them around.

## Changes and docs

- A change to the design needs an ADR in `docs/adr/` (next number, linked from the index; mark what it amends or supersedes).
- Update the docs your change affects: the root `README.md`, the `docs/README.md` index, guides, package READMEs.
- Ranking changes must not lower the golden set scores. The pre-push hook runs `pnpm eval golden` against `data/eval-index.sqlite` when ranking code changes.
- Conventional Commits (commitlint), small and focused. Add a changeset (`pnpm exec changeset`) for user-facing changes. Never edit `CHANGELOG.md` by hand.
- Done means `pnpm check` passes.
