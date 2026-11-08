# 0030 Search regression gate runs locally before push

- Status: accepted
- Date: 2026-11-03
- For: ADR 0026 (where the regression gate runs)

## Context

The golden-set regression gate (ADR 0026) needs the eval index, and any index of the pooled articles holds abstracts and CC BY-NC-ND full text. Committing it, or caching it in a public CI workspace, would publish content (ADR 0003, hard rules). Three options were open: keep the gate local, run it on a self-hosted runner that holds the index, or build a CC BY-only eval index that may be published.

## Decision

The owner chose to keep the gate local and enforce it with a Git `pre-push` hook (`.husky/pre-push`):

1. The hook diffs each pushed ref against its remote counterpart (a new branch against its merge base with `origin/main`).
2. When the diff touches ranking code (`packages/search`, `store-sqlite` and `embedder-onnx` sources, `core` chunking and text, or `testkit/golden`), it runs `eval golden --baseline` on `data/eval-index.sqlite` and the push fails on its exit code (1 regression, 2 baseline mismatch).
3. A ranking change without a local eval index fails with the command to build one. `SKIP_EVAL_GATE=1` skips the hook for one push.
4. Pushes that touch no ranking code are not delayed. The run takes about 4 s on the eval index.

## Consequences

- No article content leaves the machine, and no runner has to be kept and secured.
- The gate depends on the pusher: a contributor without an eval index, or one who skips it, can push a regression. GitHub CI stays without the gate, and a PR that changes ranking should say in its body that the gate passed.
- A self-hosted runner or a CC BY-only index can still be added later without changing the gate itself, since both would run the same command.
