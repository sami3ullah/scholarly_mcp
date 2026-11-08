# 0049 Fast release pipeline

- Status: accepted
- Date: 2026-11-08
- Records: SM-15 (owner request: releases and CI take too long); amends ADR 0039 (when the demo index is built) and the SM-14 release workflow

## Context

The v0.2.0 release took 37 minutes, and the CI `e2e` job took 12 to 34 minutes on every push to main. Measured from the job timings:

- **Demo index: 12-33 min, every CI run and every release.** Building the index image takes about 2 minutes. The rest is the ingest of the 214 demo DOIs, almost all of it Europe PMC full text: one request at a time (as the source rules ask), about a minute per page of 20 articles, with frequent HTTP 500s and timeouts that the client retries. The time depends on Europe PMC's day, and a full text that still fails after the retries is skipped, so two builds of the same commit can differ.
- **Multi-platform image builds: 16 min for the server, 8 for landing.** Both platforms were built on one amd64 runner, arm64 under QEMU emulation, so compiling sqlite-vec, `pnpm install`, the TypeScript build and the model download all ran emulated. A native amd64 build of the server image takes under 2 minutes.
- **Everything in sequence.** The landing image waited for the demo index, which it does not use, and the release rebuilt and smoke-tested an image that CI had already smoke-tested on the same commit.

## Decision

1. **The demo index is cached, per week and per input.** A composite action, `.github/actions/demo-index`, restores `index.sqlite` from the Actions cache. The key is the ISO week plus a hash of everything that shapes the index: the DOI list, the preset, the build script, the server image recipe, the lockfile, and the source of the ingest and the packages it uses (tests excluded).
2. **Built off the critical path.** `demo-index.yml` builds the exact key with `docker/demo-index/build.sh` (licence check included) and caches it: early every Monday, on demand, and on main whenever an input of the key changes. It may take up to three hours, as Europe PMC needs on a bad day. CI's `e2e` job and the release only restore: the exact key, or else the newest cached index (`restore-keys`), with a notice naming it. They build the index themselves only when the cache holds none at all (the first run, or after the cache was emptied). A cache entry made on main is readable from every branch, pull request and tag. The licence check runs every week, so a licence that changes upstream (ADR 0039) fails that build, not a release.
3. **Native builds per platform, in parallel.** The release builds each image on a runner of its own architecture (`ubuntu-24.04` and `ubuntu-24.04-arm`), four builds at once, each with its own BuildKit cache scope. Each pushes by digest only; a `publish` job per image joins the two digests into one multi-platform image under the version tags and `latest` (`docker buildx imagetools create`), then attests provenance and attaches the SBOM as before. The landing builds start right away; only the server builds wait for the index.
4. **CI on the tagged commit gates publishing.** The release no longer smoke-tests its own build. A `ci` job waits for the CI run of the tagged commit (it runs the end-to-end smoke tests on SQLite, Postgres and the self-hosting bundle) and fails unless it passed; `publish` needs it. Builds run meanwhile, so the wait costs nothing when CI is already done. Untagged digests from a failed release stay in GHCR without a tag.
5. **Builds ride out flaky upstreams.** The demo build runs the ingest with `EUROPEPMC_MAX_RETRIES=8` (default 3), so a full text that fails with a passing HTTP 500 is retried with backoff up to a minute instead of counting towards the stop after 5 articles in a row; the full ingest keeps its defaults. The image build retries the embedding model download from Hugging Face (6 attempts, waits growing by 10 s), which throttles the shared addresses of CI runners.

## Consequences

- **Times.** CI `e2e` about 5 minutes instead of 12-34, a release about 8 to 10 minutes instead of 37 (if CI on the commit has finished). Only the Demo index workflow waits on the APIs.
- **The demo index can be older than the commit.** CI and a release may use last week's index, or one built before the latest ingest change while its rebuild is still running. It was checked for CC BY 4.0 when it was built; licence changes upstream are rare (one so far) and the weekly check catches them. If an ingest change makes an older index unreadable, CI's smoke tests fail until the rebuild lands.
- **Fewer calls to Crossref and Europe PMC**, about one demo build a week instead of one per push.
- **Same results across runs of a week.** CI and the release use the same index, so a full text Europe PMC failed to return no longer changes the smoke test from one run to the next.
- **Europe PMC outages stay off the critical path.** On 2026-11-08 about half of its full-text requests answered HTTP 500, and the first builds with this pipeline failed or ran past CI's 45 minutes; that is why the build moved to its own workflow (decision 2) and retries more (decision 5). A failed weekly build shows as a red Demo index run while CI keeps using the previous index.
- **A key that misses an input** would reuse a stale index until the week turns. The hash covers the ingest's whole dependency closure; a new package the ingest starts using must be added to the list in the action and to the workflow's `paths`.
- **Tag only a commit that CI ran on** (pushed to main on its own). Otherwise the `ci` job finds no run and fails, and nothing is published.
- **arm64 runners** are free for public repositories. A private fork needs paid arm64 runners, or can put QEMU back for that one build.
