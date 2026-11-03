const DATE_KEY = '$date';

/**
 * JSON that keeps `Date` values, so domain records round-trip through a TEXT column. Dates
 * are written as `{ "$date": "<ISO>" }` and revived on read.
 */
export function toJsonWithDates(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, field: unknown) {
    const original = this[key];
    return original instanceof Date ? { [DATE_KEY]: original.toISOString() } : field;
  });
}

/** Parses JSON written by {@link toJsonWithDates}. The caller validates the result. */
export function fromJsonWithDates(text: string): unknown {
  return JSON.parse(text, (_key, field: unknown) => {
    if (field !== null && typeof field === 'object' && DATE_KEY in field) {
      const iso = (field as Record<string, unknown>)[DATE_KEY];
      if (typeof iso === 'string') return new Date(iso);
    }
    return field;
  });
}
