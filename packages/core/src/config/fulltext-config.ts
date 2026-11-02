import { z } from 'zod';

/** Licences whose open access full text may be indexed for matching only (ADR 0003). */
export const DEFAULT_FULLTEXT_LICENSES = [
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc-nd/4.0/',
] as const;

/** `FULLTEXT_LICENSE_ALLOWLIST`: comma-separated licence URLs. */
export const fulltextConfigSchema = z.object({
  FULLTEXT_LICENSE_ALLOWLIST: z
    .string()
    .default(DEFAULT_FULLTEXT_LICENSES.join(','))
    .transform((value) =>
      value
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url !== ''),
    )
    .pipe(z.array(z.url()).min(1)),
});

export type FulltextConfig = z.output<typeof fulltextConfigSchema>;
