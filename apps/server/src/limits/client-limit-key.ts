import { createHmac, randomBytes } from 'node:crypto';
import { isIPv6 } from 'node:net';
import type { AuthInfo } from '@modelcontextprotocol/server';

/** The bucket of calls with no client address: stdio, whose one client is the local process. */
const LOCAL_KEY = 'local';

/** Turns a client address into the request context that carries its rate-limit key. */
export type ClientContext = (clientAddress: string | undefined) => AuthInfo;

/**
 * Callers are anonymous (ADR 0048), so each client address gets its own rate-limit bucket.
 * The key is an HMAC of the address under a secret that lives only in this process, so no
 * address, and nothing that could be matched back to one after a restart, is stored or
 * logged. IPv6 clients are grouped by their /64, the block one connection is usually given,
 * so rotating addresses inside it does not reset the limit. The key rides in the SDK's
 * per-request `AuthInfo`, which is how request context reaches the server factory; nothing
 * is authenticated.
 */
export function createClientContext(secret: Buffer = randomBytes(32)): ClientContext {
  return (clientAddress) => {
    const key =
      clientAddress === undefined
        ? LOCAL_KEY
        : `client:${createHmac('sha256', secret).update(networkOf(clientAddress)).digest('base64url').slice(0, 22)}`;
    return { token: '', clientId: 'anonymous', scopes: [], extra: { rateLimitKey: key } };
  };
}

/** The rate-limit bucket of a request; stdio's local bucket when it carries none. */
export function rateLimitKeyOf(info: AuthInfo | undefined): string {
  const key = info?.extra?.['rateLimitKey'];
  return typeof key === 'string' ? key : LOCAL_KEY;
}

/** An IPv6 address's first four groups (its /64); IPv4 addresses as they are. */
function networkOf(address: string): string {
  if (!isIPv6(address)) return address;
  const [head = '', tail = ''] = address.toLowerCase().split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === '' ? [] : tail.split(':');
  const groups = address.includes('::')
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}
