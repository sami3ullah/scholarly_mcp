import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './badge.module.css';

/** A short status label such as an access state. */
export function Badge(props: {
  tone?: 'neutral' | 'open' | 'locked' | 'danger';
  children: ReactNode;
}) {
  return (
    <span className={cx(styles['badge'], styles[props.tone ?? 'neutral'])}>{props.children}</span>
  );
}
