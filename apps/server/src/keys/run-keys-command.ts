import type { ApiKeyStore, Clock } from '@scholarly-mcp/core';
import { apiKeyIdSchema } from '@scholarly-mcp/core';
import { parseArgs } from 'node:util';
import { generateApiKey, type NewApiKey } from '../auth/api-key-secrets.js';

export interface KeysCommandDeps {
  readonly keys: ApiKeyStore;
  readonly clock: Clock;
  readonly out: (line: string) => void;
  readonly generate?: () => NewApiKey;
}

const USAGE = `Usage:
  scholarly-mcp keys create --label <name> [--institution <id>]
  scholarly-mcp keys list
  scholarly-mcp keys revoke <key id>`;

/**
 * `scholarly-mcp keys …`: creates, lists and revokes API keys in the runtime database.
 * The full key is printed once, at creation; only its hash is stored. Returns the exit code.
 */
export async function runKeysCommand(
  args: readonly string[],
  deps: KeysCommandDeps,
): Promise<number> {
  const signal = AbortSignal.timeout(10_000);
  const [command, ...rest] = args;
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: { label: { type: 'string' }, institution: { type: 'string' } },
      allowPositionals: true,
      strict: true,
    });
  } catch {
    deps.out(USAGE);
    return 2;
  }
  const { values, positionals } = parsed;

  if (command === 'create' && values.label !== undefined && positionals.length === 0) {
    const made = (deps.generate ?? generateApiKey)();
    await deps.keys.create(
      {
        id: made.id,
        label: values.label,
        secretHash: made.secretHash,
        ...(values.institution !== undefined && { institutionId: values.institution }),
        createdAt: deps.clock.now(),
      },
      signal,
    );
    deps.out(`Created ${made.id} (${values.label}). The key is shown only now:`);
    deps.out(made.key);
    return 0;
  }
  if (command === 'list' && positionals.length === 0) {
    for (const key of await deps.keys.list(signal)) {
      const state =
        key.revokedAt === undefined ? 'active' : `revoked ${key.revokedAt.toISOString()}`;
      const institution =
        key.institutionId === undefined ? '' : `  institution=${key.institutionId}`;
      deps.out(
        `${key.id}  ${state}  created ${key.createdAt.toISOString()}  ${key.label}${institution}`,
      );
    }
    return 0;
  }
  const id = apiKeyIdSchema.safeParse(positionals[0]);
  if (command === 'revoke' && positionals.length === 1 && id.success) {
    const revoked = await deps.keys.revoke(id.data, deps.clock.now(), signal);
    deps.out(revoked ? `Revoked ${id.data}` : `${id.data} is unknown or already revoked`);
    return revoked ? 0 : 1;
  }
  deps.out(USAGE);
  return 2;
}
