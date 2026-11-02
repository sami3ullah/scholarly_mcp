import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { createTestLogger } from '@scholarly-mcp/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveHttp, type HttpServer } from './serve-http.js';

describe('serveHttp', () => {
  let server: HttpServer;
  let base: string;
  beforeEach(async () => {
    server = await serveHttp({
      factory: () => new McpServer({ name: 'test', version: '0.0.0' }),
      host: '127.0.0.1',
      port: 0,
      logger: createTestLogger(),
    });
    base = `http://127.0.0.1:${String(server.port)}`;
  });
  afterEach(async () => {
    await server.close();
  });

  it('serves MCP over Streamable HTTP at /mcp', async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    expect(client.getServerVersion()).toMatchObject({ name: 'test' });
    await client.close();
  });

  it('answers 404 for any other path', async () => {
    expect((await fetch(`${base}/other`)).status).toBe(404);
  });

  it('rejects a cross-site Origin, against DNS rebinding', async () => {
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('rejects a request whose Host is not local', async () => {
    const { request } = await import('node:http');
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        `${base}/mcp`,
        { method: 'POST', headers: { host: 'evil.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    expect(status).toBe(403);
  });
});
