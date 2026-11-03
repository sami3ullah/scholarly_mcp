import { z } from 'zod';

const dateParts = z.object({ 'date-parts': z.array(z.array(z.int().nullable())) });
const timestamp = z.object({ 'date-time': z.iso.datetime() });
const update = z.object({ DOI: z.string(), type: z.string() });

/**
 * The subset of a Crossref work this adapter reads, validated at the edge. Unknown fields are
 * ignored, so new Crossref fields never break ingestion. Field names follow Crossref's JSON.
 */
export const crossrefWorkSchema = z.object({
  DOI: z.string(),
  type: z.string(),
  title: z.array(z.string()).optional(),
  subtitle: z.array(z.string()).optional(),
  'container-title': z.array(z.string()).optional(),
  ISSN: z.array(z.string()).optional(),
  'issn-type': z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  author: z
    .array(
      z.object({
        given: z.string().optional(),
        family: z.string().optional(),
        name: z.string().optional(),
        ORCID: z.string().optional(),
      }),
    )
    .optional(),
  published: dateParts.optional(),
  issued: dateParts.optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  page: z.string().optional(),
  language: z.string().optional(),
  abstract: z.string().optional(),
  license: z
    .array(z.object({ URL: z.string(), 'content-version': z.string(), start: timestamp }))
    .optional(),
  deposited: timestamp,
  resource: z.object({ primary: z.object({ URL: z.string() }) }).optional(),
  'update-to': z.array(update).optional(),
  'updated-by': z.array(update).optional(),
});

export type CrossrefWork = z.infer<typeof crossrefWorkSchema>;

/**
 * A `/works` list response. Items stay unparsed here so one malformed record is skipped on its
 * own instead of failing the whole page.
 */
export const crossrefWorkListSchema = z.object({
  status: z.literal('ok'),
  message: z.object({
    'total-results': z.int().nonnegative(),
    items: z.array(z.unknown()),
    'next-cursor': z.string().min(1).optional(),
  }),
});

/** A Crossref error response, e.g. `{ type: 'cursor-invalid' }` for an expired cursor. */
export const crossrefFailureSchema = z.object({
  status: z.literal('failed'),
  message: z.array(z.object({ type: z.string() })),
});
