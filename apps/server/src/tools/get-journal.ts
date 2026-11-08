import { appError, issnSchema, type JournalSummary } from '@scholarly-mcp/core';
import { z } from 'zod';
import { JOURNAL_MATCH_LIMIT, asIssn, findJournals } from '../journals/match-journals.js';
import { UNTRUSTED_NOTE } from './render-cards.js';
import type { ToolDeps } from './tool-deps.js';
import { defineTool } from './tool-definition.js';

const input = z
  .strictObject({
    issn: z.string().min(1).max(20).optional().describe('A print or electronic ISSN'),
    query: z.string().min(1).max(200).optional().describe('A journal name or part of it'),
  })
  .refine((args) => (args.issn === undefined) !== (args.query === undefined), {
    message: 'Pass exactly one of issn or query',
    path: ['issn'],
  });

const journalOutput = z.object({
  name: z.string(),
  issnPrint: issnSchema.optional(),
  issnElectronic: issnSchema.optional(),
  articleCount: z.int().describe('Indexed articles of this journal'),
  openAccess: z.object({
    policy: z
      .enum(['open', 'hybrid', 'subscription'])
      .describe('As seen in its indexed articles: all, some or none open access'),
    openArticles: z.int(),
  }),
  years: z.object({ first: z.int(), last: z.int() }),
  subjects: z.array(z.string()).describe('Its most frequent subject labels'),
  url: z.url().optional().describe("The journal's page"),
});

const output = z.object({ journals: z.array(journalOutput).max(JOURNAL_MATCH_LIMIT) });

type JournalOutput = z.input<typeof journalOutput>;

/** `get_journal`: a journal as its indexed articles show it (ARCHITECTURE.md tool contracts). */
export function createGetJournalTool(deps: ToolDeps) {
  return defineTool({
    name: 'get_journal',
    title: 'Get journal',
    description: [
      `Look up a ${deps.publisher} journal by ISSN or by name (up to ${String(JOURNAL_MATCH_LIMIT)} matches).`,
      'Returns its name, ISSNs, how many of its articles are indexed and for which years, its open access policy as seen in those articles, its most frequent subjects and its page link.',
      'Everything comes from indexed articles only. Use an ISSN from here as the journal filter of search_articles.',
    ].join(' '),
    input,
    output,
    async run(args, { signal }) {
      const all = await deps.journals.list(signal);
      const found =
        args.issn === undefined ? byName(all, args.query ?? '') : byIssn(all, args.issn);
      const journals = found.slice(0, JOURNAL_MATCH_LIMIT).map((journal) => present(deps, journal));
      const text = [
        `${String(journals.length)} journal${journals.length === 1 ? '' : 's'} found. Counts cover indexed articles only.`,
        UNTRUSTED_NOTE,
        '',
        journals.map(renderJournal).join('\n\n'),
        '',
        deps.notice,
      ].join('\n');
      return { structured: { journals }, text, resultCount: journals.length };
    },
  });
}

function byIssn(journals: readonly JournalSummary[], text: string): JournalSummary[] {
  const issn = asIssn(text);
  if (issn === undefined) {
    throw appError('INVALID_INPUT', 'issn must look like 1438-8812', { field: 'issn' });
  }
  const found = findJournals(journals, issn);
  if (found.length === 0) {
    throw appError(
      'NOT_FOUND',
      `No indexed journal has the ISSN ${issn}; try get_journal with a name as query`,
      { field: 'issn' },
    );
  }
  return found;
}

function byName(journals: readonly JournalSummary[], query: string): JournalSummary[] {
  const found = findJournals(journals, query);
  if (found.length === 0) {
    throw appError(
      'NOT_FOUND',
      'No indexed journal matches that name; try fewer words, or search_articles on the topic',
      { field: 'query' },
    );
  }
  return found;
}

function present(deps: Pick<ToolDeps, 'journalUrl'>, journal: JournalSummary): JournalOutput {
  const { articleCount, openAccessCount } = journal;
  const policy =
    openAccessCount === articleCount ? 'open' : openAccessCount === 0 ? 'subscription' : 'hybrid';
  const issn = journal.issnElectronic ?? journal.issnPrint;
  return {
    name: journal.name,
    ...(journal.issnPrint !== undefined && { issnPrint: journal.issnPrint }),
    ...(journal.issnElectronic !== undefined && { issnElectronic: journal.issnElectronic }),
    articleCount,
    openAccess: { policy, openArticles: openAccessCount },
    years: { first: journal.firstYear, last: journal.lastYear },
    subjects: journal.subjects.map(({ label }) => label),
    ...(deps.journalUrl !== undefined && issn !== undefined && { url: deps.journalUrl(issn) }),
  };
}

const POLICY_LABEL = { open: 'open access', hybrid: 'hybrid', subscription: 'subscription' };

function renderJournal(journal: JournalOutput, index: number): string {
  const issns = [journal.issnPrint, journal.issnElectronic]
    .filter((issn) => issn !== undefined)
    .join(', ');
  const name = journal.url === undefined ? journal.name : `[${journal.name}](${journal.url})`;
  return [
    `${String(index + 1)}. ${name} (ISSN ${issns})`,
    `   ${String(journal.articleCount)} indexed articles, ${String(journal.years.first)}-${String(journal.years.last)} · ${POLICY_LABEL[journal.openAccess.policy]} (${String(journal.openAccess.openArticles)} open)`,
    ...(journal.subjects.length === 0 ? [] : [`   Subjects: ${journal.subjects.join('; ')}`]),
  ].join('\n');
}
