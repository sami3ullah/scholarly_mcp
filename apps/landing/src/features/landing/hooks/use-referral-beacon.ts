'use client';

import { useEffect, useRef } from 'react';
import type { Token, ToolName } from '@scholarly-mcp/core';
import { markSent, sendBeacon } from '../lib/send-beacon';
import { VISIT_PATH, type VisitBeacon } from '../model/referral';

/**
 * Sends one visit beacon per landing token, opened result and browser tab (ADR 0033), so a
 * second card opened from the chat counts. A move between results on this site does not:
 * its links drop the UTM tags, so a page without them reached from a same-origin referrer is
 * not a new referral. It runs only in a browser that rendered the page, so link previews
 * never count, and a prerendered page waits until the reader opens it. Without a token
 * there is no search to attribute, so nothing is sent.
 */
export function useReferralBeacon(
  token: Token | undefined,
  doi: string,
  campaign: ToolName | undefined,
) {
  const sent = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (token === undefined) return undefined;
    const key = `landing-visit:${token}:${doi}`;
    if (sent.current === key) return undefined;
    if (campaign === undefined && cameFromThisSite()) return undefined;
    const fire = () => {
      if (sent.current === key) return;
      sent.current = key;
      if (!markSent(key)) return;
      const visit: VisitBeacon = {
        t: token,
        doi,
        ...(campaign !== undefined && { tool: campaign }),
      };
      sendBeacon(VISIT_PATH, visit);
    };
    if (isPrerendering()) {
      document.addEventListener('prerenderingchange', fire, { once: true });
      return () => {
        document.removeEventListener('prerenderingchange', fire);
      };
    }
    fire();
    return undefined;
  }, [token, doi, campaign]);
}

/** Speculation Rules prerendering; not in TypeScript's DOM types yet. */
function isPrerendering(): boolean {
  return (document as Document & { prerendering?: boolean }).prerendering === true;
}

function cameFromThisSite(): boolean {
  if (document.referrer === '') return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
