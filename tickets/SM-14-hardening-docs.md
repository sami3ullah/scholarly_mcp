# SM-14 Hardening, image and docs (Phase 6)

## Tasks

- [ ] Load test (autocannon, 20 rps, p50/p95, memory, cold start), fuzzing
- [ ] osv-scanner, Trivy, Semgrep, gitleaks in CI; SBOM; Dependabot
- [ ] Non-root distroless image, read-only FS, image size checked; compose with sqlite/postgres profiles; prebuilt index in image
- [ ] E2E smoke script: compose up, call every tool over HTTP
- [ ] README (order per plan), `ADAPTERS.md`, `LANDING.md`, `OPERATIONS.md`, `SECURITY.md`; `presets/thieme.env`, `presets/thieme.subjects.json` (journal-level subjects by ISSN)
- [ ] Release workflow: tag -> GHCR image + SBOM
- [ ] Add volume, issue and pages to `Article` (Crossref mapping) at a planned full rebuild, so citations carry them (ADR 0025)
- [ ] Verify an ISSN-based journal page URL for the Thieme preset and set `JOURNAL_URL_TEMPLATE` (ADR 0025)
- [ ] Image: run `keys` through the same entrypoint, keep `/metrics` internal, grace period above `SHUTDOWN_TIMEOUT_MS` + 5 s; shared rate-limit store if more than one replica (ADR 0031)

## Exit

Fresh clone to working server in under 5 minutes, unaided.
