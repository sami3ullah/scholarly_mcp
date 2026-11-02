import {
  activeLicense,
  chunkSourceSchema,
  fullTextRefSchema,
  fullTextSectionSchema,
  subjectSchema,
  type Article,
  type ArticleEnricher,
} from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';

/** Options for {@link runEnricherContract}. */
export interface EnricherContractOptions {
  /** Returns an enricher backed by recorded data, never the network. */
  readonly create: () => ArticleEnricher | Promise<ArticleEnricher>;
  /** Articles the recorded data matches; at least one has full text that may be indexed. */
  readonly matched: readonly Article[];
  /** An article the recorded data has no record for. */
  readonly unmatched: Article;
  /** The licences full text may be indexed under (`FULLTEXT_LICENSE_ALLOWLIST`). */
  readonly allowlist: readonly string[];
  /** The instant licences are judged at. */
  readonly now: Date;
}

const signal = new AbortController().signal;

/**
 * The behaviour every enricher must share: matches by DOI only, valid subjects, full text
 * only under an allowlisted version-of-record licence, and full-text sections that carry no
 * label beyond the generic ones (ADR 0003, ADR 0024).
 */
export function runEnricherContract(name: string, options: EnricherContractOptions): void {
  const { create, matched, unmatched, allowlist, now } = options;

  describe(`${name} satisfies the enricher contract`, () => {
    it('is named after a chunk source', async () => {
      expect(chunkSourceSchema.safeParse((await create()).name).success).toBe(true);
    });

    it('matches by DOI only, returning valid subjects for requested articles', async () => {
      const found = await (await create()).lookup([...matched, unmatched], signal);
      expect(found.has(unmatched.doi)).toBe(false);
      const requested = new Set(matched.map((article) => article.doi));
      for (const [doi, enrichment] of found) {
        expect(requested.has(doi)).toBe(true);
        for (const subject of enrichment.subjects) {
          expect(subjectSchema.safeParse(subject).success).toBe(true);
        }
      }
      expect(found.size).toBeGreaterThan(0);
    });

    it('offers full text only under the article’s allowlisted version-of-record licence', async () => {
      const enricher = await create();
      const found = await enricher.lookup(matched, signal);
      const refs = matched.flatMap((article) => {
        const ref = found.get(article.doi)?.fullText;
        return ref === undefined ? [] : [{ article, ref }];
      });
      expect(refs.length).toBeGreaterThan(0);
      for (const { article, ref } of refs) {
        expect(fullTextRefSchema.safeParse(ref).success).toBe(true);
        expect(ref.source).toBe(enricher.name);
        expect(allowlist).toContain(ref.licenseUrl);
        expect(activeLicense(article.licenses, now)?.url).toBe(ref.licenseUrl);
      }
    });

    it('returns full-text sections with generic labels only', async () => {
      const enricher = await create();
      const found = await enricher.lookup(matched, signal);
      const [doi, enrichment] = [...found].find(([, entry]) => entry.fullText) ?? [];
      if (doi === undefined || enrichment?.fullText === undefined) {
        throw new Error('No full text in the recorded data');
      }
      const sections = await enricher.fetchFullText(doi, enrichment.fullText, signal);
      expect(sections?.length).toBeGreaterThan(0);
      for (const section of sections ?? []) {
        expect(fullTextSectionSchema.strict().safeParse(section).success).toBe(true);
      }
    });

    it('returns nothing for no articles', async () => {
      expect((await (await create()).lookup([], signal)).size).toBe(0);
    });

    it('rejects when the caller has already aborted', async () => {
      const enricher = await create();
      await expect(enricher.lookup(matched, AbortSignal.abort())).rejects.toThrow();
      const ref = {
        source: 'europepmc' as const,
        id: 'PMC1',
        licenseUrl: allowlist[0] ?? 'https://creativecommons.org/licenses/by/4.0/',
        revision: '1',
      };
      await expect(
        enricher.fetchFullText(unmatched.doi, ref, AbortSignal.abort()),
      ).rejects.toThrow();
    });
  });
}
