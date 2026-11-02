import { MAX_SEARCH_LIMIT } from '@scholarly-mcp/search';
import { articleCardSchema, doiSchema } from '@scholarly-mcp/core';
import { z } from 'zod';

/** A DOI as the model may write it: bare, `doi:` or a doi.org link; normalised on parse. */
export const doiInput = z
  .string()
  .min(1)
  .max(300)
  .pipe(doiSchema)
  .describe('The DOI, e.g. 10.1055/a-2245-1234 (a doi.org link works too)');

/** How many cards to return. */
export const limitInput = z
  .int()
  .min(1)
  .max(MAX_SEARCH_LIMIT)
  .default(5)
  .describe(
    `How many articles to return, 1 to ${String(MAX_SEARCH_LIMIT)}; default 5 keeps the reply short`,
  );

/** The card list every article-returning tool shares. */
export const cardsOutput = z.array(articleCardSchema).max(MAX_SEARCH_LIMIT);
