import { describe, expect, it } from 'vitest';
import { createClientAddressResolver, trustedProxiesError } from './client-address.js';

describe('createClientAddressResolver', () => {
  const behindCaddy = createClientAddressResolver(['172.16.0.0/12', 'fd00::/8']);

  it('takes the socket peer when no proxy is trusted, whatever X-Forwarded-For says', () => {
    const direct = createClientAddressResolver([]);
    expect(direct('203.0.113.7', '198.51.100.1')).toBe('203.0.113.7');
    expect(direct('::ffff:203.0.113.7', undefined)).toBe('203.0.113.7');
  });

  it('takes the last untrusted X-Forwarded-For hop behind a trusted proxy', () => {
    expect(behindCaddy('172.18.0.3', '203.0.113.7')).toBe('203.0.113.7');
    // A client-written first hop is ignored: only the hop Caddy appended counts.
    expect(behindCaddy('172.18.0.3', '1.2.3.4, 203.0.113.7')).toBe('203.0.113.7');
    expect(behindCaddy('172.18.0.3', ['1.2.3.4', '203.0.113.7, 172.20.0.9'])).toBe('203.0.113.7');
    expect(behindCaddy('fd00::5', '2001:db8::1')).toBe('2001:db8::1');
  });

  it('falls back to the proxy itself when the header is missing or malformed', () => {
    expect(behindCaddy('172.18.0.3', undefined)).toBe('172.18.0.3');
    expect(behindCaddy('172.18.0.3', 'not-an-ip')).toBe('172.18.0.3');
    expect(behindCaddy(undefined, '203.0.113.7')).toBeUndefined();
  });
});

describe('trustedProxiesError', () => {
  it('accepts addresses and CIDR ranges and names the first bad entry', () => {
    expect(trustedProxiesError(['10.0.0.5', '172.16.0.0/12', 'fd00::/8'])).toBeUndefined();
    expect(trustedProxiesError(['10.0.0.0/8', '10.0.0.0/33'])).toContain('10.0.0.0/33');
    expect(trustedProxiesError(['caddy'])).toContain('caddy');
    expect(trustedProxiesError(['10.0.0.0/8/1'])).toContain('10.0.0.0/8/1');
  });
});
