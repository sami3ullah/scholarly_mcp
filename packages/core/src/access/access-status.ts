import { z } from 'zod';

/**
 * What a reader can do with an article. Cards show `open`, `subscription` or `unknown`;
 * `institution` appears only once a caller's identity has been checked.
 */
export const accessStatusSchema = z.enum(['open', 'subscription', 'institution', 'unknown']);

export type AccessStatus = z.infer<typeof accessStatusSchema>;
