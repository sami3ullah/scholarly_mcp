import { z } from 'zod';

/** A DOI in canonical form: lowercase, without resolver or `doi:` prefix. */
export type Doi = string & { readonly __brand: 'Doi' };

const PREFIXES = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i;
const SHAPE = /^10\.\d{4,9}\/\S+$/;

/**
 * Normalises a DOI to its canonical form, or returns undefined when the input is not a DOI.
 * DOIs are case-insensitive by spec, so lowercasing makes them safe as primary keys.
 */
export function normalizeDoi(input: string): Doi | undefined {
  const candidate = input.trim().replace(PREFIXES, '').toLowerCase();
  return SHAPE.test(candidate) ? (candidate as Doi) : undefined;
}

/** Accepts any DOI spelling and outputs the canonical form; rejects non-DOIs. */
export const doiSchema = z.string().transform((value, ctx): Doi => {
  const doi = normalizeDoi(value);
  if (doi === undefined) {
    ctx.addIssue({ code: 'custom', message: 'Expected a DOI such as 10.1055/a-1234-5678' });
    return z.NEVER;
  }
  return doi;
});
