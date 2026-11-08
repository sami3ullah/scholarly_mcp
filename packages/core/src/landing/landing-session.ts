import { z } from 'zod';
import { doiSchema } from '../article/doi.js';
import { toolNameSchema } from '../metering/tool-name.js';
import { tokenSchema } from './token.js';

/** How long a landing link keeps working (key design decision 12). */
export const LANDING_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A search's result list stored under a random token, so the landing page can rebuild it.
 * By design it holds no query text and no personal data.
 */
export const landingSessionSchema = z
  .object({
    token: tokenSchema,
    results: z
      .array(z.object({ doi: doiSchema, matchedChunkId: z.string().min(1).optional() }))
      .min(1)
      .max(10),
    language: z.enum(['de', 'en', 'any']),
    /** The tool that made the session; absent on sessions stored before ADR 0033. */
    tool: toolNameSchema.optional(),
    createdAt: z.date(),
    expiresAt: z.date(),
    visitCount: z.int().nonnegative(),
  })
  .refine((session) => session.expiresAt > session.createdAt, {
    message: 'A session must expire after it is created',
    path: ['expiresAt'],
  });

export type LandingSession = z.infer<typeof landingSessionSchema>;
