# SM-14 Hardening, image and docs (Phase 6)

## Tasks
- [ ] Load test (autocannon, 20 rps, p50/p95, memory, cold start), fuzzing
- [ ] osv-scanner, Trivy, Semgrep, gitleaks in CI; SBOM; Dependabot
- [ ] Non-root distroless image, read-only FS, image size checked; compose with sqlite/postgres profiles; prebuilt index in image
- [ ] E2E smoke script: compose up, call every tool over HTTP
- [ ] README (order per plan), `ADAPTERS.md`, `LANDING.md`, `OPERATIONS.md`, `SECURITY.md`; `presets/thieme.env`
- [ ] Release workflow: tag -> GHCR image + SBOM

## Exit
Fresh clone to working server in under 5 minutes, unaided.
