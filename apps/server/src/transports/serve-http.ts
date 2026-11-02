import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
  type NodeIncomingMessageLike,
} from '@modelcontextprotocol/node';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import type { Logger } from '@scholarly-mcp/core';

/** The MCP endpoint's path. */
export const MCP_PATH = '/mcp';

/** Largest request body accepted; tool arguments are small (PLAN.md security: body limits). */
const MAX_BODY_BYTES = 64 * 1024;

export interface HttpServerOptions {
  readonly factory: () => McpServer;
  readonly host: string;
  readonly port: number;
  readonly logger: Logger;
}

/** A running HTTP transport. */
export interface HttpServer {
  /** The port it listens on, useful when started on port 0. */
  readonly port: number;
  close(): Promise<void>;
}

/**
 * Serves MCP over Streamable HTTP at `/mcp`, statelessly: each request gets a fresh server
 * from the factory (key design decision 2). It binds to loopback only and rejects requests
 * whose `Host` or `Origin` is not local, which guards against DNS rebinding until SM-10
 * adds API keys and an `Origin` allowlist for remote use.
 */
export async function serveHttp(options: HttpServerOptions): Promise<HttpServer> {
  const mcp = toNodeHandler(
    createMcpHandler(options.factory, {
      maxRequestBodySize: MAX_BODY_BYTES,
      onerror: (error) => {
        options.logger.warn({ reason: error.message }, 'MCP request rejected');
      },
    }),
  );
  const validHost = localhostHostValidation();
  const validOrigin = localhostOriginValidation();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!validHost(req, res) || !validOrigin(req, res)) return;
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== MCP_PATH) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    // Node types `method` as optional; on a server request it is always set.
    mcp(req as NodeIncomingMessageLike, res).catch((error: unknown) => {
      options.logger.error({ err: error }, 'HTTP request failed');
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  options.logger.info({ host: options.host, port, path: MCP_PATH }, 'MCP server listening');

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
        server.closeIdleConnections();
      }),
  };
}
