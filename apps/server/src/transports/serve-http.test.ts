import { request } from 'node:http';
import { createTestLogger } from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import type { HttpHandler } from '../http/create-http-handler.js';
import { MAX_BODY_BYTES, serveHttp, type HttpServer } from './serve-http.js';

/** A handler that echoes the body size, and holds `/slow` until released. */
function stubHandler() {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handler: HttpHandler = {
    fetch: async (req) => {
      if (new URL(req.url).pathname === '/slow') await held;
      const body = await req.text();
      return new Response(`got ${String(body.length)}`);
    },
  };
  return { handler, release };
}

async function start(handler: HttpHandler): Promise<{ server: HttpServer; base: string }> {
  const server = await serveHttp({
    handler,
    host: '127.0.0.1',
    port: 0,
    logger: createTestLogger(),
  });
  return { server, base: `http://127.0.0.1:${String(server.port)}` };
}

function rawRequest(url: string, headers: Record<string, string>): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', headers }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('serveHttp', () => {
  let server: HttpServer | undefined;
  afterEach(async () => {
    await server?.close(100);
    server = undefined;
  });

  it('passes requests to the handler', async () => {
    const started = await start(stubHandler().handler);
    server = started.server;
    const response = await fetch(`${started.base}/mcp`, { method: 'POST', body: 'abc' });
    expect(await response.text()).toBe('got 3');
  });

  it('refuses a body over 64 KB with 413 before the handler reads it', async () => {
    const started = await start(stubHandler().handler);
    server = started.server;
    const response = await fetch(`${started.base}/mcp`, {
      method: 'POST',
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });
    expect(response.status).toBe(413);
  });

  it('refuses headers over 16 KB with 431', async () => {
    const started = await start(stubHandler().handler);
    server = started.server;
    expect(await rawRequest(`${started.base}/mcp`, { 'x-big': 'x'.repeat(17 * 1024) })).toBe(431);
  });

  it('drains: close waits for a request in flight, which still gets its answer', async () => {
    const { handler, release } = stubHandler();
    const started = await start(handler);
    const slow = fetch(`${started.base}/slow`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(started.server.inFlight()).toBe(1);
    const closing = started.server.close(5000);
    release();
    const response = await slow;
    expect(await response.text()).toBe('got 0');
    expect(response.headers.get('connection')).not.toBe('keep-alive');
    expect(await closing).toBe(0);
    await expect(fetch(`${started.base}/mcp`)).rejects.toThrow();
  });

  it('cuts requests still running when the drain times out', async () => {
    const started = await start(stubHandler().handler);
    const slow = fetch(`${started.base}/slow`).catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await started.server.close(50)).toBe(1);
    expect(await slow).toBeInstanceOf(Error);
  });
});
