import type { SearchFilters } from '@scholarly-mcp/core';

/** A parameterised SQL condition. Values are never spliced into the SQL text. */
export interface SqlCondition {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

/**
 * Turns search filters into one condition over `articles a` and `chunks c`, shared by the
 * lexical and the vector query so both sides filter alike. A chunk's own language wins over
 * the article's declared one (ADR 0021, ADR 0022).
 */
export function filterSql(filters: SearchFilters): SqlCondition {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filters.includeRetracted !== true) clauses.push('a.is_retracted = 0');
  if (filters.openAccessOnly === true) clauses.push('a.is_open_access = 1');
  if (filters.language !== undefined) {
    clauses.push('COALESCE(c.language, a.language) = ?');
    params.push(filters.language);
  }
  if (filters.yearFrom !== undefined) {
    clauses.push('a.year >= ?');
    params.push(filters.yearFrom);
  }
  if (filters.yearTo !== undefined) {
    clauses.push('a.year <= ?');
    params.push(filters.yearTo);
  }
  if (filters.journalIssn !== undefined) {
    clauses.push('(a.issn_print = ? OR a.issn_electronic = ?)');
    params.push(filters.journalIssn, filters.journalIssn);
  }
  return { sql: clauses.length === 0 ? '1' : clauses.join(' AND '), params };
}
