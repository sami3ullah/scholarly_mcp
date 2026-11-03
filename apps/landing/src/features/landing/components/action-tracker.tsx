'use client';

import type { ReactNode } from 'react';
import type { Token } from '@scholarly-mcp/core';
import { useActionBeacon } from '../hooks/use-action-beacon';
import styles from './action-tracker.module.css';

/**
 * Counts clicks on the access buttons inside it (links with `data-action`). It adds no box of
 * its own, so the layout is unchanged.
 */
export function ActionTracker(props: { token: Token; doi: string; children: ReactNode }) {
  const onClick = useActionBeacon(props.token, props.doi);
  return (
    <div className={styles['tracker']} onClickCapture={onClick}>
      {props.children}
    </div>
  );
}
