# 0001 Node 24 LTS instead of Node 22

- Status: accepted
- Date: 2026-11-02
- Deviates from: PLAN.md key design decision #1 ("TypeScript on Node 22 LTS")

## Context

The plan says Node 22 LTS. Node 24 has been the active LTS line since October 2025, and Node 22 is in maintenance. The project owner asked for Node 24.

## Decision

Use Node 24 LTS for all packages, CI and the container image. TypeScript strict mode and everything else in decision #1 is unchanged.

## Consequences

- Longer support window for the production path.
- Native deps (better-sqlite3, sqlite-vec, onnxruntime-node) must ship Node 24 prebuilds; SM-00 verifies this.
