import { BlockList, isIP } from 'node:net';

/**
 * The request header carrying the client address `serveHttp` resolved. It always replaces
 * whatever a client sent under this name, so only the server ever sets it.
 */
export const CLIENT_ADDRESS_HEADER = 'x-scholarly-client-address';

/** Finds the client's address from the socket peer and, behind trusted proxies, `X-Forwarded-For`. */
export type ClientAddressResolver = (
  peer: string | undefined,
  forwardedFor: string | readonly string[] | undefined,
) => string | undefined;

/**
 * Parses `HTTP_TRUSTED_PROXIES` entries: an address (`10.0.0.5`) or a CIDR range
 * (`172.16.0.0/12`, `fd00::/8`). Returns the reason for the first invalid entry.
 */
export function trustedProxiesError(entries: readonly string[]): string | undefined {
  for (const entry of entries) {
    if (parseEntry(entry) === undefined) return `not an IP address or CIDR range: ${entry}`;
  }
  return undefined;
}

/**
 * Behind no trusted proxy the client is the socket peer. When the peer is a trusted proxy
 * (Caddy, a load balancer), the client is the right-most `X-Forwarded-For` address that is
 * not itself a trusted proxy: proxies append the address they saw, so everything left of
 * the last untrusted hop could have been written by the client and is ignored.
 */
export function createClientAddressResolver(
  trustedProxies: readonly string[],
): ClientAddressResolver {
  const trusted = new BlockList();
  for (const entry of trustedProxies) {
    const parsed = parseEntry(entry);
    if (parsed === undefined) throw new Error(`HTTP_TRUSTED_PROXIES: ${entry} is invalid`);
    if (parsed.prefix === undefined) trusted.addAddress(parsed.address, parsed.family);
    else trusted.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  const isTrusted = (address: string) => {
    const family = familyOf(address);
    return family !== undefined && trusted.check(address, family);
  };

  return (peer, forwardedFor) => {
    const client = peer === undefined ? undefined : unmapped(peer);
    if (client === undefined || !isTrusted(client)) return client;
    const hops = [forwardedFor ?? []]
      .flat()
      .flatMap((value) => value.split(','))
      .map((hop) => unmapped(hop.trim()));
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      const hop = hops[i];
      if (hop === undefined || familyOf(hop) === undefined) return client;
      if (!isTrusted(hop)) return hop;
    }
    return client;
  };
}

/** `::ffff:1.2.3.4`, as dual-stack sockets report IPv4 peers, becomes `1.2.3.4`. */
function unmapped(address: string): string {
  const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return match?.[1] ?? address;
}

function familyOf(address: string): 'ipv4' | 'ipv6' | undefined {
  const version = isIP(address);
  if (version === 4) return 'ipv4';
  if (version === 6) return 'ipv6';
  return undefined;
}

function parseEntry(
  entry: string,
): { address: string; family: 'ipv4' | 'ipv6'; prefix?: number } | undefined {
  const [address = '', prefixText, extra] = entry.split('/');
  const family = familyOf(address);
  if (family === undefined || extra !== undefined) return undefined;
  if (prefixText === undefined) return { address, family };
  if (!/^\d{1,3}$/.test(prefixText)) return undefined;
  const prefix = Number(prefixText);
  return prefix <= (family === 'ipv4' ? 32 : 128) ? { address, family, prefix } : undefined;
}
