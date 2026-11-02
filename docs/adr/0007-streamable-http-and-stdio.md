# 0007 Streamable HTTP for remote use, stdio for local development

- Status: accepted
- Date: 2026-11-02
- Records: PLAN.md key design decision #2

## Context

Organisation-wide connectors in Claude and ChatGPT need a remote HTTP endpoint. Local testing in Claude Desktop and MCP Inspector is easiest over stdio.

## Decision

The server supports both MCP transports: Streamable HTTP (with `Origin` validation and closed CORS) and stdio. Tool handlers are transport-agnostic.

## Consequences

- Both transports are covered by protocol tests in SM-09.
- Revisit when the MCP specification changes its transports.
