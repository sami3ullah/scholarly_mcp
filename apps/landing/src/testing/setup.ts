import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library cleans up by itself only with vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup();
});
