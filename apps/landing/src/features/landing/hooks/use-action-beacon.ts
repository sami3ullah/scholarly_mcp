'use client';

import { useCallback, useRef, type MouseEvent } from 'react';
import { landingActionSchema, type Token } from '@scholarly-mcp/core';
import { markSent, sendBeacon } from '../lib/send-beacon';
import { ACTION_PATH, type ActionBeacon } from '../model/referral';

/**
 * Returns a click handler that sends one action beacon per token, result, access button and
 * tab (ADR 0033). It listens for clicks on links carrying `data-action`, so the buttons stay
 * plain links rendered on the server, and the beacon survives the navigation they start.
 */
export function useActionBeacon(token: Token, doi: string) {
  const sent = useRef(new Set<string>());
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element ? event.target : undefined;
      const link = target?.closest('a[data-action]');
      const action = landingActionSchema.safeParse(link?.getAttribute('data-action'));
      if (!action.success) return;
      const key = `landing-action:${token}:${doi}:${action.data}`;
      if (sent.current.has(key)) return;
      sent.current.add(key);
      if (!markSent(key)) return;
      const payload: ActionBeacon = { t: token, doi, action: action.data };
      sendBeacon(ACTION_PATH, payload);
    },
    [token, doi],
  );
}
