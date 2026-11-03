import { createFakeClock, createTestLogger } from '@scholarly-mcp/testkit';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { callerOf } from './auth-info.js';
import { createJwtVerifier } from './create-jwt-verifier.js';

const ISSUER = 'https://id.example.org';
const AUDIENCE = 'https://mcp.example.org/mcp';
const now = new Date('2026-11-03T10:00:00Z');
const seconds = Math.floor(now.getTime() / 1000);

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let keys: JWTVerifyGetKey;
beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] });
});

function sign(claims: JWTPayload, header: { alg?: string; kid?: string } = {}) {
  return new SignJWT({
    iss: ISSUER,
    aud: AUDIENCE,
    iat: seconds,
    exp: seconds + 300,
    client_id: 'claude-ai',
    scope: 'mcp read',
    org: 'uni-9',
    ...claims,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1', ...header })
    .sign(privateKey);
}

function verifier() {
  return createJwtVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    keys,
    institutionClaim: 'org',
    clock: createFakeClock(now),
    logger: createTestLogger(),
  });
}

describe('createJwtVerifier', () => {
  it('accepts a token for this audience and names the caller by client', async () => {
    const info = await verifier().verifyAccessToken(await sign({}));
    expect(info).toMatchObject({
      clientId: 'claude-ai',
      scopes: ['mcp', 'read'],
      expiresAt: seconds + 300,
      resource: new URL(AUDIENCE),
    });
    expect(callerOf(info)).toEqual({ apiKeyId: 'oauth:claude-ai', institutionId: 'uni-9' });
  });

  it.each([
    ['another audience', { aud: 'https://other.example.org/mcp' }],
    ['another issuer', { iss: 'https://evil.example.org' }],
    ['an expired token', { exp: seconds - 60 }],
  ])('refuses %s', async (_label, claims) => {
    await expect(verifier().verifyAccessToken(await sign(claims))).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  it('refuses a token signed by an unknown key', async () => {
    const other = await generateKeyPair('ES256');
    const token = await new SignJWT({ client_id: 'x' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(seconds + 300)
      .sign(other.privateKey);
    await expect(verifier().verifyAccessToken(token)).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  it('refuses an unsigned token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: AUDIENCE, exp: seconds + 300, client_id: 'x' }),
    ).toString('base64url');
    await expect(verifier().verifyAccessToken(`${header}.${body}.`)).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  it('answers a server error when the key set cannot be fetched', async () => {
    const broken = createJwtVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      keys: () => Promise.reject(new TypeError('fetch failed')),
      clock: createFakeClock(now),
      logger: createTestLogger(),
    });
    await expect(broken.verifyAccessToken(await sign({}))).rejects.toMatchObject({
      code: 'server_error',
    });
  });

  it('falls back to azp, then sub, for the client id', async () => {
    const info = await verifier().verifyAccessToken(
      await sign({ client_id: undefined, azp: 'web-app' }),
    );
    expect(info.clientId).toBe('web-app');
  });

  it('refuses a token that names no client at all', async () => {
    await expect(
      verifier().verifyAccessToken(await sign({ client_id: undefined, sub: undefined })),
    ).rejects.toMatchObject({ code: 'invalid_token' });
  });
});
