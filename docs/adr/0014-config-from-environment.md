# 0014 Configuration from environment variables, validated at boot

- Status: accepted
- Date: 2026-11-02
- Records: ARCHITECTURE.md key design decision 9

## Context

The app ships as a container and must fail clearly when misconfigured rather than run with surprising defaults.

## Decision

All configuration comes from environment variables, parsed once at boot by `parseConfig` in core with a zod schema. It reports every problem at once, names variables but never echoes their values, and treats blank values as unset. Each config section lives next to the code that uses it (for example, licences in core, `LOG_LEVEL` in the logger package, Crossref settings in its adapter); each app composes the sections it needs. Defaults are allowed only where a value is safe and documented (for example `LOG_LEVEL=info`, ADR 0003's licence allowlist).

## Consequences

- 12-factor, container-friendly, no hidden configuration files.
- Revisit never, per the plan.
