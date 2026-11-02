# SM-00 Feasibility spike (Phase 0)

**Goal:** prove the data and model are good enough before building. Plan: "Phase 0" and "Risks".

## Tasks
- [ ] Pull 500 Crossref records for prefix 10.1055 (journal-article, from 2024-01-01) via the polite pool; measure abstract, license and language coverage
- [ ] Save 20 JATS abstract samples as fixtures (`packages/testkit/fixtures/jats/`)
- [ ] Check Europe PMC full-text coverage for the open access subset
- [ ] Run multilingual-e5-small via transformers.js and sqlite-vec in Node 22, natively and in Docker (amd64 + arm64)
- [ ] MCP hello-world tool working in MCP Inspector (Claude Desktop check is a manual step for the user)
- [ ] Cross-language test: 10 German queries vs 10 English abstracts; record hit rate

## Exit
Coverage numbers and cross-language result written to `docs/spike-results.md`; go/no-go on the model recorded as an ADR.
