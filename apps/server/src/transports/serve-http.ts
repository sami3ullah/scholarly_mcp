import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { toNodeHandler, type NodeIncomingMessageLike } from '@modelcontextprotocol/node';
import type { Logger } from '@scholarly-mcp/core';
import { CLIENT_ADDRESS_HEADER, type ClientAddressResolver } from '../http/client-address.js';
import { MCP_PATH, type HttpHandler } from '../http/create-http-handler.js';

/** Largest request body accepted; tool arguments are small (ARCHITECTURE.md security). */
export const MAX_BODY_BYTES = 64 * 1024;

export interface HttpServerOptions {
  readonly handler: HttpHandler;
  readonly host: string;
  readonly port: number;
  readonly logger: Logger;
  /** What the log calls this server; the MCP server unless set. */
  readonly name?: string;
  /** Resolves each request's client address for the handler; the socket peer when unset. */
  readonly clientAddress?: ClientAddressResolver;
  /** Told when requests start and finish, for the in-flight gauge. */
  readonly onInFlight?: (count: number) => void;
}

/** A running HTTP transport. */
export interface HttpServer {
  /** The port it listens on, useful when started on port 0. */
  readonly port: number;
  /** Requests being served now. */
  inFlight(): number;
  /**
   * Stops accepting connections and waits up to `timeoutMs` for requests in flight to
   * finish (ARCHITECTURE.md: SIGTERM drains), then cuts the rest. Resolves with how many were cut.
   */
  close(timeoutMs: number): Promise<number>;
}

/**
 * Serves the HTTP handler on a Node server with tight limits: 16 KB of headers, a 64 KB
 * body, 10 s to send headers and 60 s per request. While draining, every response asks
 * the client to close its connection, so keep-alive connections end with their request.
 * Each request reaches the handler with its client address in `CLIENT_ADDRESS_HEADER`.
 */
export async function serveHttp(options: HttpServerOptions): Promise<HttpServer> {
  const node = toNodeHandler(
    { fetch: (request: Request) => options.handler.fetch(request) },
    {
      maxRequestBodySize: MAX_BODY_BYTES,
      onerror: (error) => {
        options.logger.warn({ reason: error.message }, 'HTTP request rejected');
      },
    },
  );
  const active = new Set<ServerResponse>();
  let inFlight = 0;
  let draining = false;
  let drained: (() => void) | undefined;

  const server = createServer(
    { maxHeaderSize: 16 * 1024, headersTimeout: 10_000, requestTimeout: 60_000 },
    (req: IncomingMessage, res: ServerResponse) => {
      inFlight += 1;
      active.add(res);
      options.onInFlight?.(inFlight);
      if (draining) res.setHeader('connection', 'close');
      res.once('close', () => {
        active.delete(res);
        inFlight -= 1;
        options.onInFlight?.(inFlight);
        if (draining && inFlight === 0) drained?.();
      });
      // Only this server sets the client address header; a client's own value is dropped.
      Reflect.deleteProperty(req.headers, CLIENT_ADDRESS_HEADER);
      const peer = req.socket.remoteAddress;
      const address = options.clientAddress
        ? options.clientAddress(peer, req.headers['x-forwarded-for'])
        : peer;
      if (address !== undefined) req.headers[CLIENT_ADDRESS_HEADER] = address;
      // Node types `method` as optional; on a server request it is always set.
      node(req as NodeIncomingMessageLike, res).catch((error: unknown) => {
        options.logger.error({ err: error }, 'HTTP request failed');
        if (!res.headersSent) res.writeHead(500).end();
      });
    },
  );

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  if (options.name === undefined) {
    options.logger.info({ host: options.host, port, path: MCP_PATH }, 'MCP server listening');
  } else {
    options.logger.info({ host: options.host, port }, `${options.name} listening`);
  }

  return {
    port,
    inFlight: () => inFlight,
    close: async (timeoutMs) => {
      draining = true;
      for (const res of active) if (!res.headersSent) res.setHeader('connection', 'close');
      const closed = new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      server.closeIdleConnections();
      if (inFlight > 0) {
        const done = new Promise<void>((resolve) => {
          drained = resolve;
        });
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        });
        await Promise.race([done, timeout]);
        clearTimeout(timer);
      }
      const cut = inFlight;
      if (cut > 0) options.logger.warn({ cut }, 'Requests still running at shutdown were cut');
      server.closeAllConnections();
      await closed;
      return cut;
    },
  };
}
