import { z } from 'zod';

/**
 * What a reader can do with an article. Cards show `open`, `subscription` or `unknown`;
 * `institution` is left for a publisher's entitlements adapter that can recognise a
 * reader's institution; the server itself never knows who is calling (ADR 0048).
 */
export const accessStatusSchema = z.enum(['open', 'subscription', 'institution', 'unknown']);

export type AccessStatus = z.infer<typeof accessStatusSchema>;
