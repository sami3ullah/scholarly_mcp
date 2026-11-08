import { citationStyleSchema, formatCitation } from '@scholarly-mcp/cite';
import { canonicalDoiSchema } from '@scholarly-mcp/core';
import { z } from 'zod';
import { findArticle } from './find-article.js';
import type { ToolDeps } from './tool-deps.js';
import { defineTool } from './tool-definition.js';
import { doiInput } from './tool-schemas.js';

const input = z.strictObject({
  doi: doiInput,
  style: citationStyleSchema.default('vancouver').describe('Citation style; default vancouver'),
});

const output = z.object({
  doi: canonicalDoiSchema,
  style: citationStyleSchema,
  citation: z.string(),
  url: z.url().describe("The article's page on the publisher's site"),
  retracted: z.boolean(),
});

/** `cite`: a formatted citation with the publisher link (ARCHITECTURE.md tool contracts). */
export function createCiteTool(deps: ToolDeps) {
  return defineTool({
    name: 'cite',
    title: 'Cite article',
    description: [
      'Format the citation of one article by DOI, in Vancouver, APA or AMA style, or as a BibTeX or RIS record for reference managers, with its link.',
      'Return the citation as given; do not reformat or complete it. Retracted articles are flagged.',
    ].join(' '),
    input,
    output,
    async run({ doi, style }, { signal }) {
      const article = await findArticle(deps.reader, doi, signal);
      const citation = formatCitation(article, style);
      const structured = {
        doi: article.doi,
        style,
        citation,
        url: article.landingUrl,
        retracted: article.isRetracted,
      };
      const text = [
        ...(article.isRetracted ? ['WARNING: This article has been retracted.'] : []),
        citation,
        '',
        `Link: ${article.landingUrl}`,
        deps.notice,
      ].join('\n');
      return { structured, text, resultCount: 1 };
    },
  });
}
