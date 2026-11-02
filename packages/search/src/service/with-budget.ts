import { appError } from '@scholarly-mcp/core';

/**
 * Runs `work` with a signal that aborts when the caller aborts or `budgetMs` passes, and
 * settles no later than that even if a port ignores its signal. Running out of budget
 * becomes `TIMEOUT`; a caller's own abort is passed through unchanged.
 */
export async function withBudget<T>(
  budgetMs: number,
  caller: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = AbortSignal.timeout(budgetMs);
  const signal = AbortSignal.any([caller, timeout]);
  const { promise: aborted, reject } = Promise.withResolvers<never>();
  const onAbort = () => {
    reject(signal.reason as Error);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    return await Promise.race([work(signal), aborted]);
  } catch (error) {
    if (timeout.aborted && !caller.aborted) {
      throw appError(
        'TIMEOUT',
        `Search took longer than ${String(budgetMs)} ms; retry or narrow the query`,
        {
          cause: error,
        },
      );
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
