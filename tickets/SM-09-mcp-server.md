# SM-09 MCP server: six tools and transports (Phase 4)

## Tasks

- [ ] `apps/server` with official MCP TypeScript SDK; composition root `main.ts`
- [ ] Tools: `search_articles`, `get_article`, `find_related`, `get_journal`, `cite` (CSL, snapshot tests, 5 styles), `check_access`
- [ ] Input/output zod schemas -> JSON Schema; annotations `readOnlyHint: true`, `openWorldHint: false`
- [ ] Tool descriptions per plan conventions; `notice` on every response; ~5 KB response cap
- [ ] Error mapping in one place (`isError: true`, stable code, no stack)
- [ ] Streamable HTTP + stdio transports
- [ ] Open the index with `openIndexReader` and call `refresh()` on an interval so swapped-in builds are served; landing sessions in `RUNTIME_DB_PATH` (ADR 0022)
- [ ] Protocol tests with the SDK client: list, call each, validate outputs
- [ ] `search_articles` calls `createSearchService` (`@scholarly-mcp/search`, config `SEARCH_*`) and builds cards from its hits: link with token (SM-11), access (SM-10); only `teaser` and `whyMatched` come from article text (ADR 0023)
- [ ] Resolve `journal` (name or ISSN) to an ISSN from indexed records before searching; unknown journal = `INVALID_INPUT` on `journal` (shared with `get_journal`)
- [ ] Empty results: add the "loosen your filters" hint; `get_article` teaser via `buildTeaser`
- [ ] Extend the SM-06 full-text guardrail test to every tool's output: no full-text chunk text in any response, `Article.fullText` (a reference) not exposed beyond "full text indexed" (ADR 0003, ADR 0024)
- [ ] `get_journal` / cards may show `mesh` and `keyword` subjects (labels only, ADR 0004)

## Exit

Protocol tests pass; tools work in MCP Inspector (Claude Desktop check by user).
