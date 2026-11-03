import { z } from 'zod';
import { doiSchema } from '../article/doi.js';
import { errorCodeSchema } from '../errors/error-code.js';
import { toolNameSchema } from './tool-name.js';

/** How a call ended: `ok`, an error code, or `INTERNAL` for an unexpected failure. */
export const usageStatusSchema = z.union([z.literal('ok'), errorCodeSchema, z.literal('INTERNAL')]);
export type UsageStatus = z.infer<typeof usageStatusSchema>;

/** The access buttons on the landing page whose clicks the funnel counts (ADR 0033). */
export const landingActionSchema = z.enum([
  'read',
  'sign_in',
  'buy',
  'view_on_publisher',
  'check_access',
]);
export type LandingAction = z.infer<typeof landingActionSchema>;

/** What every event has. The id is the idempotency key the exporter and the funnel dedupe on. */
const envelope = {
  id: z.string().min(1),
  apiKeyId: z.string().min(1),
  occurredAt: z.date(),
  exportedAt: z.date().optional(),
};

/** How many cards of one journal an answer showed. */
export const journalCardCountSchema = z.object({
  journal: z.string().min(1),
  cards: z.int().positive(),
});
export type JournalCardCount = z.infer<typeof journalCardCountSchema>;

/** One tool call. Failed calls are kept but are not billable. */
export const toolCallEventSchema = z
  .object({
    ...envelope,
    kind: z.literal('tool_call'),
    tool: toolNameSchema,
    resultCount: z.int().nonnegative(),
    latencyMs: z.number().nonnegative(),
    status: usageStatusSchema,
    billable: z.boolean(),
    /** Cards shown per journal; empty for failed calls and tools without cards. */
    cardsByJournal: z.array(journalCardCountSchema),
  })
  .refine((event) => event.status === 'ok' || !event.billable, {
    message: 'Failed calls are not billable',
    path: ['billable'],
  });
export type ToolCallEvent = z.infer<typeof toolCallEventSchema>;

/** What both referral kinds share: one result of a live search session, never its token. */
const referral = {
  ...envelope,
  /** The tool whose session the link belongs to, when known. */
  tool: toolNameSchema.optional(),
  doi: doiSchema,
  journal: z.string().min(1),
  billable: z.literal(false),
};

/** A reader opened one result of a search on the landing page. */
export const landingVisitEventSchema = z.object({
  ...referral,
  kind: z.literal('landing_visit'),
});
export type LandingVisitEvent = z.infer<typeof landingVisitEventSchema>;

/** A reader clicked an access button on the landing page. */
export const landingActionEventSchema = z.object({
  ...referral,
  kind: z.literal('landing_action'),
  action: landingActionSchema,
});
export type LandingActionEvent = z.infer<typeof landingActionEventSchema>;

/**
 * One metering event (ADR 0033): a tool call, or a landing visit or action that a live
 * session attributes to it. Never holds query text or a landing token.
 */
export const usageEventSchema = z.discriminatedUnion('kind', [
  toolCallEventSchema,
  landingVisitEventSchema,
  landingActionEventSchema,
]);
export type UsageEvent = z.infer<typeof usageEventSchema>;
export type UsageEventKind = UsageEvent['kind'];
