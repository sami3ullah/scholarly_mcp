# SM-09 MCP server: six tools and transports (Phase 4)

## Tasks

- [x] `apps/server` with official MCP TypeScript SDK; composition root `main.ts`
- [x] Tools: `search_articles`, `get_article`, `find_related`, `get_journal`, `cite` (CSL, snapshot tests, 5 styles), `check_access`
- [x] Input/output zod schemas -> JSON Schema; annotations `readOnlyHint: true`, `openWorldHint: false`
- [x] Tool descriptions per plan conventions; `notice` on every response; ~5 KB response cap
- [x] Error mapping in one place (`isError: true`, stable code, no stack)
- [x] Streamable HTTP + stdio transports
- [x] Open the index with `openIndexReader` and call `refresh()` on an interval so swapped-in builds are served; landing sessions in `RUNTIME_DB_PATH` (ADR 0022)
- [x] Protocol tests with the SDK client: list, call each, validate outputs
- [x] `search_articles` calls `createSearchService` (`@scholarly-mcp/search`, config `SEARCH_*`) and builds cards from its hits: link with token (SM-11), access (SM-10); only `teaser` and `whyMatched` come from article text (ADR 0023)
- [x] Resolve `journal` (name or ISSN) to an ISSN from indexed records before searching; unknown journal = `INVALID_INPUT` on `journal` (shared with `get_journal`)
- [x] Empty results: add the "loosen your filters" hint; `get_article` teaser via `buildTeaser`
- [x] Extend the SM-06 full-text guardrail test to every tool's output: no full-text chunk text in any response, `Article.fullText` (a reference) not exposed beyond "full text indexed" (ADR 0003, ADR 0024)
- [x] `get_journal` / cards may show `mesh` and `keyword` subjects (labels only, ADR 0004)

- [x] Rules recorded in ADR 0025; client guide `docs/guides/connecting-clients.md`

## Exit

Protocol tests pass; tools work in MCP Inspector (Claude Desktop check by user).

- [x] Protocol tests pass over the HTTP handler and stdio (`apps/server/src/server/protocol.test.ts`); `pnpm check` green (999 tests, 96% lines)
- [x] MCP Inspector CLI on the live index (70,911 articles): `tools/list` shows the six tools, `tools/call search_articles` returns cards
- [x] End to end over stdio and HTTP with the real embedder: search 337 ms cold / 211 ms warm, `find_related` 101 ms, other tools under 20 ms
- [ ] Claude Desktop check (user; config in the client guide)
