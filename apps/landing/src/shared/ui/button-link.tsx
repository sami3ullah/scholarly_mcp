import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './button-link.module.css';

/**
 * A link styled as a button, for actions that leave the page (read, sign in, buy). `action`
 * names it for the funnel's action beacon (`data-action`).
 */
export function ButtonLink(props: {
  href: string;
  variant?: 'primary' | 'secondary';
  action?: string;
  children: ReactNode;
}) {
  const variant = props.variant ?? 'primary';
  return (
    <a
      className={cx(styles['button'], styles[variant])}
      href={props.href}
      {...(props.action !== undefined && { 'data-action': props.action })}
    >
      {props.children}
      {/* Every button leaves for the publisher's site, so each carries an outbound arrow. */}
      <svg className={styles['icon']} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M5 11 11 5M6 5h5v5" />
      </svg>
    </a>
  );
}
