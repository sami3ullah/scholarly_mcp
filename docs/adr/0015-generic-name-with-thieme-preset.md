# 0015 Generic `scholarly-mcp` name with a Thieme preset

- Status: accepted
- Date: 2026-11-02
- Records: PLAN.md key design decision #10

## Context

Using a publisher's trademark in a repository name implies an affiliation that does not exist.

## Decision

The project is `scholarly-mcp`. Thieme-specific values (DOI prefix 10.1055, journal list, landing base URL, journal subjects) live in a preset under `presets/`. Server metadata, README and every response say "Independent prototype, not affiliated with Thieme". No Thieme logo.

## Consequences

- Shows the design works for any Crossref prefix.
- Revisit when Thieme adopts it.
