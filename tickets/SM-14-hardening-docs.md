# SM-14 Hardening, image and docs (Phase 6)

## Tasks

- [ ] Load test (autocannon, 20 rps, p50/p95, memory, cold start), fuzzing
- [ ] osv-scanner, Trivy, Semgrep, gitleaks in CI; SBOM; Dependabot
- [ ] Non-root distroless image, read-only FS, image size checked; compose with sqlite/postgres profiles; prebuilt index in image
- [ ] E2E smoke script: compose up, call every tool over HTTP
- [ ] README (order per plan), `ADAPTERS.md`, `LANDING.md`, `OPERATIONS.md`, `SECURITY.md`; `presets/thieme.env`, `presets/thieme.subjects.json` (journal-level subjects by ISSN)
- [ ] Release workflow: tag -> GHCR image + SBOM
- [x] Add volume, issue and pages to `Article` (Crossref mapping) at a planned full rebuild, so citations carry them (ADR 0025). Full rebuild done 2026-11-03: 70,989 articles, `verify` ok; volume on 67,529, issue on 67,377, pages on 66,102; every article has subjects (57,379 from the journal preset).
- [x] Verify an ISSN-based journal page URL for the Thieme preset and set `JOURNAL_URL_TEMPLATE` (ADR 0025). Checked by the owner on 2026-11-03: `https://www.thieme-connect.de/products/ejournals/issn/0936-5214` answers "No articles available", so no ISSN-based URL exists and `JOURNAL_URL_TEMPLATE` stays unset in the preset; journal links are omitted as documented.
- [ ] Image: run `keys` through the same entrypoint, keep `/metrics` internal, grace period above `SHUTDOWN_TIMEOUT_MS` + 5 s; shared rate-limit store if more than one replica (ADR 0031)
- [x] Landing app image: `output: 'standalone'` (left out in SM-11 because `next start` refuses it), `LANDING_API_SECRET` from the secret store, a proxy that sets `x-forwarded-for`, landing API reachable only from the app; shared landing rate limit for replicas (ADR 0032). Done in ADR 0038; the shared limit is ADR 0036's Postgres bucket store.

## Plan (session 19)

Worked in this order. The order puts the slow full rebuild first, so it runs in the background while the rest is built, and puts the docs last, so they describe what shipped.

1. **Citation fields.** `volume`, `issue`, `pages` on `Article` (optional free-form strings: Thieme deposits `S 01`, `e12-e20`, `CP`), mapped from Crossref, into CSL-JSON. Then start the planned full rebuild in the background (new fields change every content hash).
2. **Thieme preset.** Verify an ISSN-based journal page URL and set `JOURNAL_URL_TEMPLATE`; add `presets/thieme.subjects.json` (journal-level subjects by ISSN, ADR 0004) and wire it if not wired yet.
3. **Shared limits.** A rate-limit bucket port with in-memory and Postgres adapters, used by the server's per-key limit and the landing per-visitor limit when more than one replica runs (ADR 0031, ADR 0032). ADR.
4. **Server image.** Multi-stage `docker/server.Dockerfile`: distroless Node 24, non-root, read-only root FS, prebuilt index baked in, one entrypoint for `serve`, `keys` and `funnel`; `/metrics` on an internal port; stop grace above `SHUTDOWN_TIMEOUT_MS` + 5 s; size checked. Compose `sqlite` and `postgres` profiles for the server.
5. **Landing image.** `output: 'standalone'` (behind a build flag so `next start` keeps working), `LANDING_API_SECRET` from a secret, a proxy that sets `x-forwarded-for`, landing API reachable only from the app.
6. **E2E smoke.** A script that runs compose up, creates a key, and calls every tool over HTTP; run in CI.
7. **Load test and fuzzing.** autocannon at 20 rps (p50/p95, memory, cold start) written down; fast-check fuzzing of the HTTP edge and tool inputs.
8. **CI security.** osv-scanner, Trivy (image), Semgrep, gitleaks; Dependabot; SBOM.
9. **Release workflow.** Tag -> GHCR image + SBOM. Index decision (2026-11-03, delegated to us by the owner): the public image carries only a small demo index of CC BY 4.0 articles, so a fresh pull answers queries in minutes without redistributing abstracts or CC BY-NC-ND chunk text; the full index is never published and is built with `ingest full` or baked into a local or private image via `--build-context index=<dir>`. Record as an ADR with step 9.
10. **Docs.** README in plan order, `ADAPTERS.md`, `LANDING.md`, `OPERATIONS.md`, `SECURITY.md`; docs index, roadmap.
11. **Exit check.** Fresh clone to working server in under 5 minutes, timed.

## Exit

Fresh clone to working server in under 5 minutes, unaided.
