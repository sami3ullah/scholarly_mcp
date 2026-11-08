import { buildTeaser } from '@scholarly-mcp/search';
import { articleCardSchema, issnSchema, type Article } from '@scholarly-mcp/core';
import { z } from 'zod';
import { buildCard } from '../cards/build-card.js';
import { findArticle } from './find-article.js';
import { UNTRUSTED_NOTE, renderCard } from './render-cards.js';
import { presentationRules, type ToolDeps } from './tool-deps.js';
import { defineTool } from './tool-definition.js';
import { doiInput } from './tool-schemas.js';

/** Subjects shown per article; labels only (ADR 0004). */
const SUBJECT_LIMIT = 10;

const RETRACTED_WARNING =
  'This article has been retracted. Do not rely on its findings; tell the reader it was retracted.';

const input = z.strictObject({ doi: doiInput });

const journalRefOutput = z.object({
  name: z.string(),
  issnPrint: issnSchema.optional(),
  issnElectronic: issnSchema.optional(),
  url: z.url().optional().describe("The journal's page"),
});

const output = z.object({
  card: articleCardSchema,
  subjects: z.array(z.string()).max(SUBJECT_LIMIT).describe('Subject labels, e.g. MeSH terms'),
  journal: journalRefOutput,
  retracted: z.boolean(),
  warning: z.string().optional(),
  fullTextIndexed: z
    .boolean()
    .describe('Whether open access full text was used for matching; it is never shown'),
});

/** `get_article`: one card by DOI, with subjects and journal (ARCHITECTURE.md tool contracts). */
export function createGetArticleTool(deps: ToolDeps) {
  return defineTool({
    name: 'get_article',
    title: 'Get article',
    description: [
      'Look up one article by DOI: its card (title, journal, year, teaser, access, licence, link), subject labels and journal.',
      'There is no abstract beyond the teaser; the link has the rest. Retracted articles are flagged.',
      presentationRules(deps.publisher),
    ].join(' '),
    input,
    output,
    async run({ doi }, { signal }) {
      const article = await findArticle(deps.reader, doi, signal);
      const links = await deps.links.links(
        { tool: 'get_article', language: 'any', results: [{ doi: article.doi }] },
        signal,
      );
      const card = buildCard(
        { article, teaser: buildTeaser(article), whyMatched: 'Looked up by DOI' },
        links.article(article.doi),
        deps.clock.now(),
      );
      const subjects = subjectLabels(article);
      const journal = journalRef(deps, article);
      const structured = {
        card,
        subjects,
        journal,
        retracted: article.isRetracted,
        ...(article.isRetracted && { warning: RETRACTED_WARNING }),
        fullTextIndexed: article.fullText !== undefined,
      };
      const text = [
        ...(article.isRetracted ? [`WARNING: ${RETRACTED_WARNING}`] : []),
        UNTRUSTED_NOTE,
        '',
        renderCard(card, 1, true),
        ...(subjects.length === 0 ? [] : [`   Subjects: ${subjects.join('; ')}`]),
        ...(journal.url === undefined ? [] : [`   Journal page: ${journal.url}`]),
        '',
        deps.notice,
      ].join('\n');
      return { structured, text, resultCount: 1, cards: [card] };
    },
  });
}

/** Unique subject labels, MeSH and keywords before journal-level ones. */
export function subjectLabels(article: Article): string[] {
  const order = { mesh: 0, keyword: 1, journal: 2 } as const;
  const labels = [...article.subjects]
    .sort((a, b) => order[a.origin] - order[b.origin])
    .map(({ label }) => label);
  return [...new Set(labels)].slice(0, SUBJECT_LIMIT);
}

/** The article's journal with its page link when a template is configured. */
function journalRef(deps: Pick<ToolDeps, 'journalUrl'>, article: Article) {
  const { name, issnPrint, issnElectronic } = article.journal;
  const issn = issnElectronic ?? issnPrint;
  return {
    name,
    ...(issnPrint !== undefined && { issnPrint }),
    ...(issnElectronic !== undefined && { issnElectronic }),
    ...(deps.journalUrl !== undefined && issn !== undefined && { url: deps.journalUrl(issn) }),
  };
}
