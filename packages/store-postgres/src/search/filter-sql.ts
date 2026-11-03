import type { SearchFilters } from '@scholarly-mcp/core';

/** A parameterised SQL condition. Values are never spliced into the SQL text. */
export interface SqlCondition {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Turns search filters into one condition over the chunk row `c`, which carries its
 * article's filter columns, shared by the lexical and the vector query so both sides filter
 * alike. Placeholders are numbered from `$<first>`, after the query's own parameters. The
 * language is the chunk's own, else the article's declared one (ADR 0021, 0022).
 */
export function filterSql(filters: SearchFilters, first: number): SqlCondition {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${String(first + params.length - 1)}`;
  };
  if (filters.includeRetracted !== true) clauses.push('NOT c.is_retracted');
  if (filters.openAccessOnly === true) clauses.push('c.is_open_access');
  if (filters.language !== undefined) clauses.push(`c.search_language = ${bind(filters.language)}`);
  if (filters.excludeLanguage !== undefined) {
    clauses.push(`c.search_language IS DISTINCT FROM ${bind(filters.excludeLanguage)}`);
  }
  if (filters.yearFrom !== undefined) clauses.push(`c.year >= ${bind(filters.yearFrom)}`);
  if (filters.yearTo !== undefined) clauses.push(`c.year <= ${bind(filters.yearTo)}`);
  if (filters.journalIssns !== undefined) {
    const issns = bind(filters.journalIssns);
    clauses.push(
      `(c.issn_print = ANY(${issns}::text[]) OR c.issn_electronic = ANY(${issns}::text[]))`,
    );
  }
  return { sql: clauses.length === 0 ? 'true' : clauses.join(' AND '), params };
}
