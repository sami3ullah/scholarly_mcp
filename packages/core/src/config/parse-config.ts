import type { z } from 'zod';

/** Environment variables as a process sees them. */
export type Env = Readonly<Record<string, string | undefined>>;

/**
 * Validates environment variables against a schema at boot and fails fast with every problem
 * at once. Empty values count as unset, as `.env` files and compose often leave them blank.
 * Messages name the variable but never echo its value, which may be a secret.
 */
export function parseConfig<S extends z.ZodType>(schema: S, env: Env): z.output<S> {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = schema.safeParse(present);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `- ${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
  );
  throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
}
