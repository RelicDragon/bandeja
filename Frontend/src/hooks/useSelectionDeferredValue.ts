import { useEffect, useState } from 'react';

function hasNonEmptyTextSelection(): boolean {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  return selection.toString().length > 0;
}

/**
 * Holds the previous value while the user has a text selection, then applies
 * the latest value when selection ends (so background updates do not yank text).
 */
export function useSelectionDeferredValue<T>(value: T): T {
  const [stable, setStable] = useState(value);

  useEffect(() => {
    if (Object.is(stable, value)) return;

    if (!hasNonEmptyTextSelection()) {
      setStable(value);
      return;
    }

    const onSelectionChange = () => {
      if (hasNonEmptyTextSelection()) return;
      setStable(value);
      document.removeEventListener('selectionchange', onSelectionChange);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [value, stable]);

  return stable;
}
