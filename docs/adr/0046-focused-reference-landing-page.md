# 0046 Focused reference landing page

- Status: accepted
- Date: 2026-11-07
- Records: owner request after trying the local demo; amends ADR 0032 decision 2 for the reference app only

## Context

ADR 0032 has the reference landing page show the chosen article with the search's other results beside it and a heading that names the search's topics ("Your results on Cardiology"). Trying the demo, the owner found the page busy: the reader already has the results list in the chat, so a second list beside the article competes with the next step (read, sign in, buy), and the topic heading adds a line that says little. The owner asked for a clear, focused reading page in the style of a story page on Medium.

## Decision

1. **One article per page.** The reference app no longer renders the search's other results or the topic heading. The page is one centred reading column of about 680 px: access badge, title, byline, the access actions, where the search matched, abstract, subjects, DOI and licence, then related reading.
2. **Related reading stays, at the end.** Up to three articles close in meaning come after the article as a plain list, as "more to read" at the end of a story, linked by DOI alone as before.
3. **The landing API is unchanged.** It still returns `matches` and `topics`, so a publisher rebuilding the page in its own stack may show them; the reference app ignores them. The visit and action beacons and the token are unchanged, so funnel attribution (ADR 0033) is the same.
4. **Type and colour.** A serif for the article's own words (title, matched passage, abstract), the system sans for everything around them; local font stacks only, so the page loads no web font. Neutral background, ink text, one blue accent for links; the primary action is an ink-filled pill, secondary actions are outlined pills. Light and dark follow the system setting.

## Consequences

- A reader who wants another result goes back to the chat, where the cards already list them.
- `MatchList` and the `otherResults`, `resultsOn`, `resultsHeading` and `articleHeading` messages are gone from the app; the API schema keeps `matches` and `topics`.
- LANDING.md describes the reference page as one article plus related reading, and the API section still documents `matches` and `topics`.
