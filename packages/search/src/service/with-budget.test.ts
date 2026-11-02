import { isAppError } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { withBudget } from './with-budget.js';

const never = () => new Promise<never>(() => undefined);

describe('withBudget', () => {
  it('returns the result of work that finishes in time', async () => {
    await expect(
      withBudget(1000, new AbortController().signal, () => Promise.resolve(7)),
    ).resolves.toBe(7);
  });

  it('fails with TIMEOUT when the budget runs out, even if the work ignores its signal', async () => {
    const error: unknown = await withBudget(10, new AbortController().signal, never).catch(
      (caught: unknown) => caught,
    );
    expect(isAppError(error) && error.code).toBe('TIMEOUT');
  });

  it('aborts the signal it hands to the work', async () => {
    let seen: AbortSignal | undefined;
    await withBudget(10, new AbortController().signal, (signal) => {
      seen = signal;
      return never();
    }).catch(() => undefined);
    expect(seen?.aborted).toBe(true);
  });

  it("passes the caller's own abort through, not as a timeout", async () => {
    const controller = new AbortController();
    controller.abort(new Error('client went away'));
    await expect(withBudget(1000, controller.signal, never)).rejects.toThrow('client went away');
  });

  it('passes errors of the work through', async () => {
    await expect(
      withBudget(1000, new AbortController().signal, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });
});
