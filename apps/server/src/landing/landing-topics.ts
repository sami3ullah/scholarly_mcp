import { LANDING_TOPIC_LIMIT, type Article } from '@scholarly-mcp/core';

/**
 * Names a search's topic from its results' subjects, never from the query (ARCHITECTURE.md links
 * and landing pages: the query may hold patient details). Labels that several results
 * share come first, most shared first; without shared labels the chosen article's own
 * labels stand in. MeSH and keywords are used before journal-level subjects, which are too
 * broad to name a search, and labels differing only in case count as one.
 */
export function landingTopics(chosen: Article, others: readonly Article[]): string[] {
  const tallies = new Map<string, { label: string; count: number; order: number }>();
  for (const article of [chosen, ...others]) {
    for (const label of specificLabels(article)) {
      const key = label.toLowerCase();
      const tally = tallies.get(key);
      if (tally === undefined) tallies.set(key, { label, count: 1, order: tallies.size });
      else tally.count += 1;
    }
  }
  const shared = [...tallies.values()]
    .filter(({ count }) => count > 1)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ label }) => label);
  return (shared.length > 0 ? shared : specificLabels(chosen)).slice(0, LANDING_TOPIC_LIMIT);
}

/** An article's unique labels, MeSH and keywords first, journal-level ones only as a fallback. */
function specificLabels(article: Article): string[] {
  const specific = article.subjects.filter(({ origin }) => origin !== 'journal');
  const chosen = specific.length > 0 ? specific : article.subjects;
  const seen = new Set<string>();
  return chosen
    .map(({ label }) => label)
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
