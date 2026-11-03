import type { AccessStatus } from '@scholarly-mcp/core';
import { Badge } from '../../../shared/ui/badge';

const TONE = {
  open: 'open',
  institution: 'open',
  subscription: 'locked',
  unknown: 'neutral',
} as const;

/** An access state as a badge. */
export function AccessBadge(props: {
  access: AccessStatus;
  labels: Readonly<Record<AccessStatus, string>>;
}) {
  return <Badge tone={TONE[props.access]}>{props.labels[props.access]}</Badge>;
}
