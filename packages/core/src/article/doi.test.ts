import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { canonicalDoiSchema, doiSchema, doiUrl, normalizeDoi } from './doi.js';

const doiArb = fc
  .tuple(
    fc.stringMatching(/^\d{4,9}$/),
    fc.stringMatching(/^[A-Za-z0-9._;()/:-]{1,30}$/).filter((suffix) => suffix.trim() !== ''),
  )
  .map(([registrant, suffix]) => `10.${registrant}/${suffix}`);

describe('normalizeDoi', () => {
  it.each([
    ['10.1055/A-2204-4549', '10.1055/a-2204-4549'],
    ['https://doi.org/10.1055/a-2204-4549', '10.1055/a-2204-4549'],
    ['http://dx.doi.org/10.1055/a-2204-4549', '10.1055/a-2204-4549'],
    ['doi:10.1055/s-0043-1763660', '10.1055/s-0043-1763660'],
    ['  DOI: 10.1055/s-0043-1763660 ', '10.1055/s-0043-1763660'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });

  it.each(['', 'atrial fibrillation', '10.10/x', '10.1055/', '10.1055/has space'])(
    'returns undefined for non-DOI input %j',
    (input) => {
      expect(normalizeDoi(input)).toBeUndefined();
    },
  );

  it('is idempotent', () => {
    fc.assert(
      fc.property(doiArb, (doi) => {
        const once = normalizeDoi(doi);
        expect(once).toBeDefined();
        expect(normalizeDoi(once ?? '')).toBe(once);
      }),
    );
  });

  it('gives the same result for every prefix and case variant', () => {
    fc.assert(
      fc.property(
        doiArb,
        fc.constantFrom('', 'https://doi.org/', 'http://dx.doi.org/', 'doi:', 'DOI: '),
        fc.boolean(),
        (doi, prefix, upper) => {
          const variant = prefix + (upper ? doi.toUpperCase() : doi);
          expect(normalizeDoi(variant)).toBe(normalizeDoi(doi));
        },
      ),
    );
  });

  it('never throws and only returns lowercase DOIs', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const doi = normalizeDoi(input);
        if (doi !== undefined) {
          expect(doi).toBe(doi.toLowerCase());
          expect(doi.startsWith('10.')).toBe(true);
        }
      }),
    );
  });
});

describe('doiSchema', () => {
  it('outputs the canonical DOI', () => {
    expect(doiSchema.parse('https://doi.org/10.1055/A-1')).toBe('10.1055/a-1');
  });

  it('rejects text that is not a DOI with an actionable message', () => {
    const result = doiSchema.safeParse('not a doi');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('Expected a DOI');
  });
});

describe('canonicalDoiSchema', () => {
  it.each([
    ['10.1055/a-1', true],
    ['10.1055/A-1', false],
    ['https://doi.org/10.1055/a-1', false],
    ['not a doi', false],
  ])('accepts %j: %s', (value, expected) => {
    expect(canonicalDoiSchema.safeParse(value).success).toBe(expected);
  });

  it('can be written as JSON Schema for tool outputs', () => {
    expect(() => z.toJSONSchema(canonicalDoiSchema, { io: 'output' })).not.toThrow();
  });
});

describe('doiUrl', () => {
  it('links to doi.org and keeps # and ? inside the DOI', () => {
    expect(doiUrl(doiSchema.parse('10.1055/a-1234'))).toBe('https://doi.org/10.1055/a-1234');
    expect(doiUrl(doiSchema.parse('10.1002/(sici)1#2?x'))).toBe(
      'https://doi.org/10.1002/(sici)1%232%3Fx',
    );
  });
});
