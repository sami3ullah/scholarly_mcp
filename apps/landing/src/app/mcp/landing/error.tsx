'use client';

import { ErrorView } from '../../../features/landing/components/error-view';

export default function LandingError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorView onRetry={reset} />;
}
