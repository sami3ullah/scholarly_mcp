import { z } from 'zod';

/**
 * Where usage events go (ADR 0031). Every `METER_EXPORT_MS` the exporter sends up to
 * `METER_BATCH_SIZE` pending events to each sink: JSON lines appended to `METER_JSONL_PATH`,
 * and, when set, a POST to `METER_WEBHOOK_URL`, signed with `METER_WEBHOOK_SECRET`. Failures
 * back off up to `METER_BACKOFF_MAX_MS`. Exported events are deleted after
 * `METER_RETENTION_DAYS`.
 */
export const meteringConfigSchema = z.object({
  METER_EXPORT_MS: z.coerce.number().int().min(100).max(3_600_000).default(5000),
  METER_BATCH_SIZE: z.coerce.number().int().min(1).max(5000).default(500),
  METER_JSONL_PATH: z.string().min(1).default('data/usage.jsonl'),
  METER_WEBHOOK_URL: z.url({ protocol: /^https?$/ }).optional(),
  METER_WEBHOOK_SECRET: z
    .string()
    .min(32, 'METER_WEBHOOK_SECRET must be at least 32 characters')
    .optional(),
  METER_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  METER_BACKOFF_MAX_MS: z.coerce.number().int().min(1000).max(3_600_000).default(300_000),
  METER_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
});
