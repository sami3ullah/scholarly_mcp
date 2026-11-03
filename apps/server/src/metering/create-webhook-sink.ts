import { createHash, createHmac } from 'node:crypto';
import type { Clock } from '@scholarly-mcp/core';
import { toWireEvent, type UsageSink } from './usage-sink.js';

export interface WebhookSinkOptions {
  readonly url: string;
  /** Signs each body so the receiver can tell it came from this server. */
  readonly secret?: string;
  readonly timeoutMs: number;
  readonly clock: Clock;
  readonly fetch?: typeof fetch;
}

/** Header names the receiver checks; documented in the operations guide. */
export const SIGNATURE_HEADER = 'x-scholarly-signature';
export const TIMESTAMP_HEADER = 'x-scholarly-timestamp';

/**
 * POSTs `{ "events": [...] }` to a billing endpoint. Any 2xx accepts the batch; anything
 * else, or no answer within the timeout, rejects it for a later retry. With a secret, the
 * signature is `sha256=` HMAC-SHA256 of `<timestamp>.<body>`, so a captured request cannot
 * be replayed with another timestamp. `Idempotency-Key` names the batch's events.
 */
export function createWebhookSink(options: WebhookSinkOptions): UsageSink {
  const send = options.fetch ?? fetch;
  return {
    name: 'webhook',
    send: async (events, signal) => {
      const body = JSON.stringify({ events: events.map(toWireEvent) });
      const timestamp = String(Math.floor(options.clock.now().getTime() / 1000));
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'idempotency-key': createHash('sha256')
          .update(events.map(({ id }) => id).join('\n'))
          .digest('base64url'),
        [TIMESTAMP_HEADER]: timestamp,
      };
      if (options.secret !== undefined) {
        const mac = createHmac('sha256', options.secret).update(`${timestamp}.${body}`);
        headers[SIGNATURE_HEADER] = `sha256=${mac.digest('hex')}`;
      }
      const response = await send(options.url, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)]),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Webhook answered HTTP ${String(response.status)}`);
    },
  };
}
