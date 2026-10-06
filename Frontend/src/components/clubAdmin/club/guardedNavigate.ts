/**
 * Code-driven console navigation that respects the Club forms' unsaved-changes guard
 * (`UnsavedChangesGuard` in `formChrome.tsx`). Links are guarded by click interception; chrome that
 * navigates from a button (the club switcher) goes through `useGuardedNavigate` instead.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

type GuardRequest = (href: string, replace: boolean) => void;

/** The mounted dirty guard, if any (one Club form page is mounted at a time). */
let activeGuard: GuardRequest | null = null;

/** Called by a dirty `UnsavedChangesGuard`; returns the unregister function. */
export function registerUnsavedGuard(request: GuardRequest): () => void {
  activeGuard = request;
  return () => {
    if (activeGuard === request) activeGuard = null;
  };
}

/** `navigate` that opens the guard's leave prompt while a Club form is dirty. */
export function useGuardedNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: string, opts?: { replace?: boolean }) => {
      if (activeGuard) activeGuard(to, !!opts?.replace);
      else navigate(to, opts);
    },
    [navigate]
  );
}
