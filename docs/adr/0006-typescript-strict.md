# 0006 TypeScript in strict mode

- Status: accepted
- Date: 2026-11-02
- Records: ARCHITECTURE.md key design decision 1 (runtime version amended by ADR 0001)

## Context

The server, ingestion and landing page share domain types. The official MCP TypeScript SDK is the reference implementation, and an official Java SDK exists if Thieme ever ports it.

## Decision

TypeScript everywhere, ESM only, with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and typed ESLint (`strictTypeChecked`). No `any`, no `@ts-ignore`. Runtime is Node 24 LTS (ADR 0001).

## Consequences

- One language for server, ingestion and landing page; types flow from core to every app.
- Optional fields must be omitted rather than set to `undefined`, which keeps records honest about missing data (for example, no invented abstracts).

Revisit when Thieme mandates another runtime.
