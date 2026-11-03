'use client';

import { useCallback, useState } from 'react';

/** Open/closed state for a disclosure such as a long abstract. */
export function useExpandable(initiallyExpanded = false) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const toggle = useCallback(() => {
    setExpanded((value) => !value);
  }, []);
  const collapse = useCallback(() => {
    setExpanded(false);
  }, []);
  return { expanded, toggle, collapse };
}
