import { useContext } from 'react';
import { ThreadViewContext, type ThreadViewValue } from './ThreadViewContext';

/** Access thread view state from descendants of {@link ThreadViewProvider}. */
export function useThreadView(): ThreadViewValue {
  const ctx = useContext(ThreadViewContext);
  if (!ctx) {
    throw new Error('useThreadView must be used within ThreadViewProvider');
  }
  return ctx;
}

export function useThreadViewOptional(): ThreadViewValue | null {
  return useContext(ThreadViewContext);
}

export type { ThreadViewValue };
