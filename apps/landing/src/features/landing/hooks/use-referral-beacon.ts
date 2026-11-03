'use client';

import { useEffect, useRef } from 'react';
import type { Token, ToolName } from '@scholarly-mcp/core';
import { VISIT_PATH, type Visit } from '../model/visit';

/** Where a sent visit is remembered, so a reload or a move to another result is not a visit. */
const sentKey = (token: Token) => `landing-visit:${token}`;

/**
 * Sends one referral beacon per landing token and browser tab (PLAN.md links and landing
 * pages). It runs only in a browser that rendered the page, so link previews that fetch
 * HTML never count. A prerendered page waits until the reader actually opens it. Without a
 * token there is no search to attribute, so nothing is sent.
 */
export function useReferralBeacon(token: Token | undefined, campaign: ToolName | undefined) {
  const sent = useRef(false);

  useEffect(() => {
    if (token === undefined || sent.current || wasSent(token)) return;
    const fire = () => {
      if (sent.current) return;
      sent.current = true;
      remember(token);
      send({ t: token, ...(campaign !== undefined && { tool: campaign }) });
    };
    if (isPrerendering()) {
      document.addEventListener('prerenderingchange', fire, { once: true });
      return () => {
        document.removeEventListener('prerenderingchange', fire);
      };
    }
    fire();
    return undefined;
  }, [token, campaign]);
}

/** Speculation Rules prerendering; not in TypeScript's DOM types yet. */
function isPrerendering(): boolean {
  return (document as Document & { prerendering?: boolean }).prerendering === true;
}

function send(visit: Visit): void {
  const body = JSON.stringify(visit);
  const blob = new Blob([body], { type: 'application/json' });
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(VISIT_PATH, blob)) return;
  void fetch(VISIT_PATH, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
    keepalive: true,
  }).catch(() => undefined);
}

// Storage can be off (private mode, blocked cookies); the ref still stops repeats.
function wasSent(token: Token): boolean {
  try {
    return sessionStorage.getItem(sentKey(token)) !== null;
  } catch {
    return false;
  }
}

function remember(token: Token): void {
  try {
    sessionStorage.setItem(sentKey(token), '1');
  } catch {
    // Nothing to do: the beacon was sent, and only a reload could send it again.
  }
}
