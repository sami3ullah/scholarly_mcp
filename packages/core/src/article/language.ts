import { z } from 'zod';

/** An ISO 639-1 language code in lowercase, e.g. `de` or `en`. */
export const languageSchema = z.string().regex(/^[a-z]{2}$/, 'Expected an ISO 639-1 code');

export type Language = z.infer<typeof languageSchema>;
