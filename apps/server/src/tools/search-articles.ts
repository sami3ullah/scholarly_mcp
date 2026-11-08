import type { SearchFilters } from '@scholarly-mcp/core';
import { CARD_VIEW_URI } from '@scholarly-mcp/card-view';
import { QUERY_MAX_LENGTH } from '@scholarly-mcp/search';
import { z } from 'zod';
import { buildCard } from '../cards/build-card.js';
import { issnsOf, resolveJournal } from '../journals/match-journals.js';
import { renderCardList } from './render-cards.js';
import { presentationRules, type ToolDeps } from './tool-deps.js';
import { defineTool } from './tool-definition.js';
import { cardsOutput, limitInput } from './tool-schemas.js';

const year = z.int().min(1600).max(2200);

const input = z.strictObject({
  query: z
    .string()
    .min(1)
    .max(QUERY_MAX_LENGTH)
    .describe('What to look for, in German or English, or a DOI to look one article up'),
  language: z
    .enum(['de', 'en', 'any'])
    .default('any')
    .describe('Only passages in this language; "any" (default) also finds the other language'),
  journal: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('A journal name or ISSN; get_journal looks journals up'),
  yearFrom: year.optional().describe('Earliest publication year'),
  yearTo: year.optional().describe('Latest publication year'),
  openAccessOnly: z.boolean().default(false).describe('Only open access articles'),
  limit: limitInput,
  cursor: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('The nextCursor of the previous page, to get the next one'),
});

const output = z.object({
  cards: cardsOutput,
  collectionUrl: z.url().optional().describe('One page with all results of this call'),
  nextCursor: z.string().optional().describe('Pass as cursor to get the next page'),
  indexVersion: z.string(),
  hint: z.string().optional(),
});

/** `search_articles`: hybrid search returning article cards (PLAN.md tool contracts). */
export function createSearchArticlesTool(deps: ToolDeps) {
  return defineTool({
    name: 'search_articles',
    title: 'Search articles',
    description: [
      `Search ${deps.publisher} journal articles in German and English; a query in one language also finds articles in the other.`,
      'Returns up to 10 article cards: title, journal, year, first author, a teaser of at most 280 characters, why it matched, access, licence and a link.',
      'Filter by language, journal (name or ISSN), years and open access. A DOI as the query looks that article up.',
      presentationRules(deps.publisher),
    ].join(' '),
    input,
    output,
    ui: CARD_VIEW_URI,
    async run(args, { signal }) {
      const filters = await filtersOf(deps, args, signal);
      const result = await deps.search.search(
        {
          query: args.query,
          filters,
          limit: args.limit,
          ...(args.cursor !== undefined && { cursor: args.cursor }),
        },
        signal,
      );
      const links = await deps.links.links(
        {
          tool: 'search_articles',
          language: args.language,
          results: result.hits.map(({ article, matchedChunkId }) => ({
            doi: article.doi,
            ...(matchedChunkId !== undefined && { matchedChunkId }),
          })),
        },
        signal,
      );
      const now = deps.clock.now();
      const cards = result.hits.map((hit) => buildCard(hit, links.article(hit.article.doi), now));
      const hint = cards.length === 0 ? emptyHint(args) : undefined;
      const structured = {
        cards,
        ...(links.collectionUrl !== undefined && { collectionUrl: links.collectionUrl }),
        ...(result.nextCursor !== undefined && { nextCursor: result.nextCursor }),
        indexVersion: result.indexVersion,
        ...(hint !== undefined && { hint }),
      };
      const text = renderCardList({
        intro:
          cards.length === 0
            ? 'No articles matched.'
            : `${String(cards.length)} article${cards.length === 1 ? '' : 's'} found.`,
        cards,
        ...(links.collectionUrl !== undefined && { collectionUrl: links.collectionUrl }),
        footer: [
          ...(hint === undefined ? [] : [hint]),
          ...(result.nextCursor === undefined
            ? []
            : [`More results: call search_articles again with cursor "${result.nextCursor}".`]),
        ],
        notice: deps.notice,
      });
      return { structured, text, resultCount: cards.length, cards };
    },
  });
}

type Args = z.output<typeof input>;

async function filtersOf(deps: ToolDeps, args: Args, signal: AbortSignal): Promise<SearchFilters> {
  const journal =
    args.journal === undefined
      ? undefined
      : resolveJournal(await deps.journals.list(signal), args.journal);
  return {
    ...(args.language !== 'any' && { language: args.language }),
    ...(journal !== undefined && { journalIssns: issnsOf(journal) }),
    ...(args.yearFrom !== undefined && { yearFrom: args.yearFrom }),
    ...(args.yearTo !== undefined && { yearTo: args.yearTo }),
    ...(args.openAccessOnly && { openAccessOnly: true }),
  };
}

/** Empty results are an answer, not an error; the hint says what to loosen (PLAN.md). */
function emptyHint(args: Args): string {
  const filters = [
    args.language !== 'any' && 'language',
    args.journal !== undefined && 'journal',
    (args.yearFrom !== undefined || args.yearTo !== undefined) && 'years',
    args.openAccessOnly && 'open access',
  ].filter((name): name is string => name !== false);
  if (args.cursor !== undefined) return 'No more results for this search.';
  return filters.length === 0
    ? 'Try other or fewer words, or a broader topic.'
    : `Loosen your filters (${filters.join(', ')}) or try other words.`;
}
