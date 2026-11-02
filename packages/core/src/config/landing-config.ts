import { z } from 'zod';

/** `LANDING_BASE_URL`: where landing links point, e.g. the reference landing app. */
export const landingConfigSchema = z.object({
  LANDING_BASE_URL: z.url({ protocol: /^https?$/ }),
});

export type LandingConfig = z.output<typeof landingConfigSchema>;
