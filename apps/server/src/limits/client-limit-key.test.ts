import { describe, expect, it } from 'vitest';
import { createClientContext, rateLimitKeyOf } from './client-limit-key.js';

describe('createClientContext', () => {
  const secret = Buffer.alloc(32, 7);
  const keyOf = (address: string | undefined) =>
    rateLimitKeyOf(createClientContext(secret)(address));

  it('keys a client by an HMAC of its address, never the address itself', () => {
    const key = keyOf('203.0.113.7');
    expect(key).toMatch(/^client:[\w-]{22}$/);
    expect(key).not.toContain('203');
    expect(keyOf('203.0.113.7')).toBe(key);
    expect(keyOf('203.0.113.8')).not.toBe(key);
  });

  it('groups IPv6 clients by their /64', () => {
    expect(keyOf('2001:db8:1:2::1')).toBe(keyOf('2001:db8:1:2:ffff:0:0:9'));
    expect(keyOf('2001:0db8:0001:0002::1')).toBe(keyOf('2001:db8:1:2::1'));
    expect(keyOf('2001:db8:1:3::1')).not.toBe(keyOf('2001:db8:1:2::1'));
  });

  it('changes every key with the process secret, so keys mean nothing after a restart', () => {
    const other = rateLimitKeyOf(createClientContext(Buffer.alloc(32, 8))('203.0.113.7'));
    expect(other).not.toBe(keyOf('203.0.113.7'));
  });

  it('puts calls without an address, and stdio, in the local bucket', () => {
    expect(keyOf(undefined)).toBe('local');
    expect(rateLimitKeyOf(undefined)).toBe('local');
  });
});
