# 0013 zod schemas as the single source of truth at the edges

- Status: accepted
- Date: 2026-11-02
- Records: ARCHITECTURE.md key design decision 8

## Context

Config, source records, tool input and tool output all cross a trust boundary. MCP needs JSON Schema for tools.

## Decision

Define each boundary type once as a zod schema in core and infer the TypeScript type from it (`z.infer`). Validate at the edges; inside core, trust the types. Tool JSON Schemas are generated from the same zod schemas. Test builders validate through these schemas, so tests cannot build impossible records.

## Consequences

- One definition per type; no drift between validation, types and the MCP schema.
- zod is the only third-party dependency core is allowed (enforced by dependency-cruiser).
