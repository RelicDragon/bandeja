import { useEffect, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Open-overlay registry (pauses schedule polling)
// ---------------------------------------------------------------------------

let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConsoleOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, () => openCount > 0, () => false);
}

/** Count an overlay as open while `open` is true (any console overlay, not only sheets). */
export function useRegisterConsoleOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    openCount += 1;
    emit();
    return () => {
      openCount -= 1;
      emit();
    };
  }, [open]);
}

// ---------------------------------------------------------------------------
// Breakpoint
// ---------------------------------------------------------------------------

const LG_QUERY = '(min-width: 1024px)';

function subscribeLg(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** Desktop console layout (sidebar, side panels): ≥ 1024 px. */
export function useIsLg(): boolean {
  return useSyncExternalStore(
    subscribeLg,
    () => (typeof window !== 'undefined' && !!window.matchMedia ? window.matchMedia(LG_QUERY).matches : false),
    () => false
  );
}

