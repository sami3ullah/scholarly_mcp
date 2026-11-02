# scholarly-mcp

MCP server that turns AI assistants into a discovery channel for a scholarly publisher (Thieme preset). Independent prototype, not affiliated with Thieme.

- Full spec: `docs/PLAN.md` (read Overview, Architecture, Key design decisions, Engineering standards before coding).
- Work queue: `tickets/README.md`. Work tickets in order; tick tasks in the ticket file and update the status table.
- Docs: root `README.md` and `docs/README.md` index; keep the README roadmap and docs index in sync with tickets and new guides.
- Remote: push `main` to origin after each finished chunk.
- Session recovery: `docs/session-handoff.md`. Read it first in a new conversation; append a new dated entry before compacting or ending a session. Do not create other recovery logs.
- Node 24 LTS via nvm: run `source ~/.nvm/nvm.sh && nvm use` before pnpm commands.
- Hard rules: official APIs only (Crossref, Europe PMC); no article content beyond the 280-char teaser; no query text in URLs, logs or stores; no Thieme logo or branding claims.
- Design changes need an ADR in `docs/adr/`.
- Commits: Conventional Commits, small and focused. No co-author trailers. Never edit CHANGELOG.md by hand.
