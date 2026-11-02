import { z } from 'zod';

/** `LOG_LEVEL`: pino level, `info` unless set. */
export const loggingConfigSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type LoggingConfig = z.output<typeof loggingConfigSchema>;
