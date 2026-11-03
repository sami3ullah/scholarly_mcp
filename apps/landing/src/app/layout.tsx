import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/** No page of this app may be indexed: each one is personal to a search (ADR 0032). */
export const metadata: Metadata = {
  title: { default: 'Article', template: '%s' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
