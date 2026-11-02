# 0018 Plain text with links everywhere, MCP Apps cards where supported

- Status: accepted
- Date: 2026-11-02
- Records: PLAN.md key design decision #13

## Context

Clients differ: some render MCP Apps UI resources, many only text. Links must survive in all of them.

## Decision

Every tool returns cards as plain text with links. Where the client supports MCP Apps, `search_articles` also returns a card-list UI resource with a "Read on Thieme" button. Both are built from the same `ArticleCard`.

## Consequences

- No client loses the links; capable clients get a clearer call to action.
- The funnel (cards shown vs landing visits) shows per client when links get dropped.
- Revisit when client support for MCP Apps changes.
