import { createFakeClock, createInMemoryApiKeyStore } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { secretMatches } from '../auth/api-key-secrets.js';
import { runKeysCommand } from './run-keys-command.js';

function setup() {
  const keys = createInMemoryApiKeyStore();
  const lines: string[] = [];
  const deps = {
    keys,
    clock: createFakeClock(new Date('2026-11-03T10:00:00Z')),
    out: (line: string) => lines.push(line),
  };
  return { keys, lines, run: (...args: string[]) => runKeysCommand(args, deps) };
}

describe('scholarly-mcp keys', () => {
  it('creates a key, prints it once and stores only its hash', async () => {
    const { keys, lines, run } = setup();
    expect(await run('create', '--label', 'demo', '--institution', 'uni-1')).toBe(0);
    const printed = lines[1] ?? '';
    expect(printed).toMatch(/^smk_key_[a-z2-7]{12}_/);
    const [stored] = await keys.list(new AbortController().signal);
    expect(stored).toMatchObject({ label: 'demo', institutionId: 'uni-1' });
    expect(JSON.stringify(stored)).not.toContain(printed.slice(-43));
    expect(secretMatches(printed.slice(-43), stored?.secretHash ?? '')).toBe(true);
  });

  it('lists keys without secrets and revokes one', async () => {
    const { lines, run } = setup();
    await run('create', '--label', 'demo');
    const id = /key_[a-z2-7]{12}/.exec(lines[0] ?? '')?.[0] ?? '';
    expect(await run('revoke', id)).toBe(0);
    expect(await run('revoke', id)).toBe(1);
    lines.length = 0;
    await run('list');
    expect(lines).toEqual([
      `${id}  revoked 2026-11-03T10:00:00.000Z  created 2026-11-03T10:00:00.000Z  demo`,
    ]);
  });

  it.each([[[]], [['create']], [['revoke', 'nope']], [['create', '--label', 'x', '--bogus']]])(
    'prints usage and exits 2 for %j',
    async (args) => {
      const { lines, run } = setup();
      expect(await run(...args)).toBe(2);
      expect(lines[0]).toMatch(/^Usage:/);
    },
  );
});
