# SM-09 MCP server: six tools and transports (Phase 4)

## Tasks
- [ ] `apps/server` with official MCP TypeScript SDK; composition root `main.ts`
- [ ] Tools: `search_articles`, `get_article`, `find_related`, `get_journal`, `cite` (CSL, snapshot tests, 5 styles), `check_access`
- [ ] Input/output zod schemas -> JSON Schema; annotations `readOnlyHint: true`, `openWorldHint: false`
- [ ] Tool descriptions per plan conventions; `notice` on every response; ~5 KB response cap
- [ ] Error mapping in one place (`isError: true`, stable code, no stack)
- [ ] Streamable HTTP + stdio transports
- [ ] Protocol tests with the SDK client: list, call each, validate outputs

## Exit
Protocol tests pass; tools work in MCP Inspector (Claude Desktop check by user).
