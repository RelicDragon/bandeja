import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

export function useWakeScreenForLiveScoring(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    let nativeActive = false;

    const activateNativeFallback = async () => {
      if (!Capacitor.isNativePlatform() || nativeActive) return;
      try {
        await KeepAwake.keepAwake();
        nativeActive = true;
      } catch {
        /* */
      }
    };

    const releaseNative = async () => {
      if (!nativeActive) return;
      nativeActive = false;
      try {
        await KeepAwake.allowSleep();
      } catch {
        /* */
      }
    };

    void (async () => {
      if ('wakeLock' in navigator) {
        const wl = navigator.wakeLock as { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        try {
          lock = await wl.request('screen');
          if (cancelled) {
            await lock.release();
            lock = null;
          } else {
            await releaseNative();
          }
        } catch {
          await activateNativeFallback();
        }
      } else {
        await activateNativeFallback();
      }
    })();

    const onVis = () => {
      if (document.visibilityState !== 'visible' || cancelled || !('wakeLock' in navigator)) return;
      void (async () => {
        try {
          const wl = navigator.wakeLock as { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
          lock = await wl.request('screen');
          await releaseNative();
        } catch {
          await activateNativeFallback();
        }
      })();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
      void releaseNative();
    };
  }, [enabled]);
}
