import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { callerOf, withCaller } from './auth-info.js';
import { createApiKeyOrJwtVerifier } from './create-api-key-or-jwt-verifier.js';

const RESOURCE = new URL('https://mcp.example.org/mcp');
const KEY = `smk_key_aaaaaaaaaaaa_${'A'.repeat(43)}`;
const JWT = 'eyJhbGciOiJFUzI1NiJ9.e30.sig';

function fake(name: string, seen: string[]): OAuthTokenVerifier {
  return {
    verifyAccessToken: (token) => {
      seen.push(`${name}:${token}`);
      if (token.endsWith('bad')) {
        return Promise.reject(new OAuthError(OAuthErrorCode.InvalidToken, `${name} refused`));
      }
      const info: AuthInfo = withCaller(
        { token, clientId: name, scopes: name === 'jwt' ? ['mcp', 'read'] : [], expiresAt: 1 },
        { apiKeyId: name },
      );
      return Promise.resolve(name === 'jwt' ? { ...info, resource: RESOURCE } : info);
    },
  };
}

function setup() {
  const seen: string[] = [];
  const verifier = createApiKeyOrJwtVerifier({
    apiKeys: fake('key', seen),
    jwt: fake('jwt', seen),
    resource: RESOURCE,
    scopes: ['mcp'],
  });
  return { seen, verifier };
}

describe('createApiKeyOrJwtVerifier', () => {
  it('sends smk_ tokens to the key store only, granting this resource and the required scopes', async () => {
    const { seen, verifier } = setup();
    const info = await verifier.verifyAccessToken(KEY);
    expect(seen).toEqual([`key:${KEY}`]);
    expect(info).toMatchObject({ clientId: 'key', resource: RESOURCE, scopes: ['mcp'] });
    expect(callerOf(info)).toEqual({ apiKeyId: 'key' });
  });

  it('sends every other token to the JWT check only, unchanged', async () => {
    const { seen, verifier } = setup();
    const info = await verifier.verifyAccessToken(JWT);
    expect(seen).toEqual([`jwt:${JWT}`]);
    expect(info).toMatchObject({ clientId: 'jwt', scopes: ['mcp', 'read'], resource: RESOURCE });
  });

  it('passes on the refusal of the verifier that owns the format, without trying the other', async () => {
    const { seen, verifier } = setup();
    await expect(verifier.verifyAccessToken('smk_bad')).rejects.toThrow('key refused');
    await expect(verifier.verifyAccessToken('eyJbad')).rejects.toThrow('jwt refused');
    expect(seen).toEqual(['key:smk_bad', 'jwt:eyJbad']);
  });
});
