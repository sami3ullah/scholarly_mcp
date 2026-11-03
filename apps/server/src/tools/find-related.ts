import { canonicalDoiSchema } from '@scholarly-mcp/core';
import { z } from 'zod';
import { buildCard } from '../cards/build-card.js';
import { renderCardList } from './render-cards.js';
import { presentationRules, type ToolDeps } from './tool-deps.js';
import { defineTool } from './tool-definition.js';
import { cardsOutput, doiInput, limitInput } from './tool-schemas.js';

const input = z.strictObject({ doi: doiInput, limit: limitInput });

const output = z.object({
  article: z
    .object({ doi: canonicalDoiSchema, title: z.string() })
    .describe('The article the related ones were found for'),
  cards: cardsOutput,
  collectionUrl: z.url().optional(),
  indexVersion: z.string(),
  hint: z.string().optional(),
});

/** `find_related`: nearest neighbours of an article by meaning (PLAN.md tool contracts). */
export function createFindRelatedTool(deps: ToolDeps) {
  return defineTool({
    name: 'find_related',
    title: 'Find related articles',
    description: [
      'Find articles close in meaning to one article, given its DOI, across German and English. Retracted articles are left out.',
      'Returns article cards like search_articles.',
      presentationRules(deps.publisher),
    ].join(' '),
    input,
    output,
    async run({ doi, limit }, { signal, caller }) {
      const result = await deps.search.related({ doi, limit }, signal);
      const links = await deps.links.links(
        {
          tool: 'find_related',
          language: 'any',
          caller,
          results: result.hits.map(({ article, matchedChunkId }) => ({
            doi: article.doi,
            ...(matchedChunkId !== undefined && { matchedChunkId }),
          })),
        },
        signal,
      );
      const now = deps.clock.now();
      const cards = result.hits.map((hit) => buildCard(hit, links.article(hit.article.doi), now));
      const hint =
        cards.length === 0
          ? 'No related articles are indexed; try search_articles on its topic.'
          : undefined;
      const structured = {
        article: { doi: result.article.doi, title: result.article.title },
        cards,
        ...(links.collectionUrl !== undefined && { collectionUrl: links.collectionUrl }),
        indexVersion: result.indexVersion,
        ...(hint !== undefined && { hint }),
      };
      const text = renderCardList({
        intro: `${String(cards.length)} article${cards.length === 1 ? '' : 's'} related to ${result.article.doi}.`,
        cards,
        ...(links.collectionUrl !== undefined && { collectionUrl: links.collectionUrl }),
        ...(hint !== undefined && { footer: [hint] }),
        notice: deps.notice,
      });
      return { structured, text, resultCount: cards.length, cards };
    },
  });
}
