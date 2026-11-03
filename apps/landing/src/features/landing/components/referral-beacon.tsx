'use client';

import type { Token, ToolName } from '@scholarly-mcp/core';
import { useReferralBeacon } from '../hooks/use-referral-beacon';

/** Sends the referral beacon once the page is shown; renders nothing. */
export function ReferralBeacon(props: {
  token: Token | undefined;
  campaign: ToolName | undefined;
}) {
  useReferralBeacon(props.token, props.campaign);
  return null;
}
