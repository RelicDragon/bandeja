import { useEffect } from 'react';

/**
 * Keeps the device screen awake while live scoring (Wake Lock API).
 */
export function useWakeScreenForLiveScoring(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    const wl = navigator.wakeLock as { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    void (async () => {
      try {
        lock = await wl.request('screen');
        if (cancelled) {
          await lock.release();
          lock = null;
        }
      } catch {
        // denied or unsupported
      }
    })();
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [enabled]);
}
