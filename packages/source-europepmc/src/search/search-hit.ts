import { z } from 'zod';

const yesNo = z.enum(['Y', 'N']);

/** The fields of a Europe PMC `core` search result the adapter reads; the rest is ignored. */
export const searchHitSchema = z.object({
  source: z.string(),
  doi: z.string().optional(),
  pmcid: z.string().optional(),
  isOpenAccess: yesNo.optional(),
  inEPMC: yesNo.optional(),
  license: z.string().optional(),
  authMan: yesNo.optional(),
  epmcAuthMan: yesNo.optional(),
  nihAuthMan: yesNo.optional(),
  fullTextIdList: z.object({ fullTextId: z.array(z.string()) }).optional(),
  meshHeadingList: z
    .object({ meshHeading: z.array(z.object({ descriptorName: z.string() })) })
    .optional(),
  keywordList: z.object({ keyword: z.array(z.string()) }).optional(),
  fullTextReceivedDate: z.string().optional(),
  dateOfRevision: z.string().optional(),
});

export type SearchHit = z.infer<typeof searchHitSchema>;

/** A search response page; hits are checked one by one so a bad one does not sink the page. */
export const searchResponseSchema = z.object({
  hitCount: z.number().int().nonnegative(),
  nextCursorMark: z.string().optional(),
  resultList: z.object({ result: z.array(z.unknown()) }),
});
