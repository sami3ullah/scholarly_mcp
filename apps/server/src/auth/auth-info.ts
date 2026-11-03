import type { AuthInfo } from '@modelcontextprotocol/server';
import type { Caller } from '@scholarly-mcp/core';

/** The caller every request has when auth is off: stdio, or HTTP on loopback (ADR 0025). */
export const LOCAL_CALLER: Caller = { apiKeyId: 'local' };

/** Carries the resolved caller in the SDK's `AuthInfo`, which reaches the server factory. */
export function withCaller(info: Omit<AuthInfo, 'extra'>, caller: Caller): AuthInfo {
  return { ...info, extra: { caller } };
}

/** The caller a request was authenticated as, or the local caller when auth is off. */
export function callerOf(info: AuthInfo | undefined): Caller {
  const caller = info?.extra?.['caller'] as Caller | undefined;
  return caller ?? LOCAL_CALLER;
}
