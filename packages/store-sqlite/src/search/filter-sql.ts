import type { SearchFilters } from '@scholarly-mcp/core';

/** A parameterised SQL condition. Values are never spliced into the SQL text. */
export interface SqlCondition {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

/**
 * Turns search filters into one condition over the vector row `s`, which carries the
 * article's filter columns, shared by the lexical and the vector query so both sides filter
 * alike. Its language is the chunk's own, else the article's declared one (ADR 0021, 0022).
 */
export function filterSql(filters: SearchFilters): SqlCondition {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filters.includeRetracted !== true) clauses.push('s.is_retracted = 0');
  if (filters.openAccessOnly === true) clauses.push('s.is_open_access = 1');
  if (filters.language !== undefined) {
    clauses.push('s.language = ?');
    params.push(filters.language);
  }
  if (filters.excludeLanguage !== undefined) {
    clauses.push('s.language IS NOT ?');
    params.push(filters.excludeLanguage);
  }
  if (filters.yearFrom !== undefined) {
    clauses.push('s.year >= ?');
    params.push(filters.yearFrom);
  }
  if (filters.yearTo !== undefined) {
    clauses.push('s.year <= ?');
    params.push(filters.yearTo);
  }
  if (filters.journalIssns !== undefined) {
    const issns = filters.journalIssns;
    if (issns.length === 0) {
      clauses.push('0');
    } else {
      const marks = issns.map(() => '?').join(', ');
      clauses.push(`(s.issn_print IN (${marks}) OR s.issn_electronic IN (${marks}))`);
      params.push(...issns, ...issns);
    }
  }
  return { sql: clauses.length === 0 ? '1' : clauses.join(' AND '), params };
}
