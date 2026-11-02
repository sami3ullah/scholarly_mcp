import { z } from 'zod';
import { errorCodeSchema } from '../errors/error-code.js';
import { toolNameSchema } from './tool-name.js';

/**
 * One tool call, recorded for billing and analytics. Never holds query text. The id is the
 * idempotency key the exporter dedupes on; failed calls are kept but are not billable.
 */
export const usageEventSchema = z
  .object({
    id: z.string().min(1),
    apiKeyId: z.string().min(1),
    tool: toolNameSchema,
    resultCount: z.int().nonnegative(),
    latencyMs: z.number().nonnegative(),
    status: z.union([z.literal('ok'), errorCodeSchema]),
    billable: z.boolean(),
    occurredAt: z.date(),
    exportedAt: z.date().optional(),
  })
  .refine((event) => event.status === 'ok' || !event.billable, {
    message: 'Failed calls are not billable',
    path: ['billable'],
  });

export type UsageEvent = z.infer<typeof usageEventSchema>;
