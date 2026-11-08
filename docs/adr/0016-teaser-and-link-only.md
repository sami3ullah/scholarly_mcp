# 0016 Only a 280-character teaser and a link in chat

- Status: accepted
- Date: 2026-11-02
- Records: ARCHITECTURE.md key design decision 11 (licence allowlist amended by ADR 0003)

## Context

The goal is traffic to the publisher's site, where it can personalise, convert and measure. Showing abstracts or full text in chat would remove the reason to click.

## Decision

Each card carries a teaser of at most 280 characters, enforced by `articleCardSchema` (`TEASER_MAX_LENGTH`), plus a landing link. Full text is used only for matching under a licence allowlist (ADR 0003); `isDisplayable` in core is the one check that keeps full-text chunks out of anything shown.

## Consequences

- The output schema makes oversize teasers impossible rather than discouraged.
- Revisit when Thieme sets its own content policy.
