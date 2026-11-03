'use client';

import type { Token, ToolName } from '@scholarly-mcp/core';
import { useReferralBeacon } from '../hooks/use-referral-beacon';

/** Sends the visit beacon once the page is shown; renders nothing. */
export function ReferralBeacon(props: {
  token: Token | undefined;
  doi: string;
  campaign: ToolName | undefined;
}) {
  useReferralBeacon(props.token, props.doi, props.campaign);
  return null;
}
