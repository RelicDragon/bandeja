import { useSyncExternalStore } from 'react';

/**
 * Environments where focusing an input shows a software keyboard:
 * touch/coarse pointers, or narrow viewports (mobile browsers that report fine pointer).
 */
const QUERY = '(hover: none) and (pointer: coarse), (max-width: 48rem)';

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(QUERY).matches;
}

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

export function useSoftwareKeyboardUi(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
