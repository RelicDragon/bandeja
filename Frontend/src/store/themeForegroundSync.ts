import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isCapacitor } from '@/utils/capacitor';

export const THEME_FOREGROUND_RETRY_DELAYS_MS = [50, 300] as const;

export function startThemeForegroundSync(onForeground: () => void): () => void {
  const retryTimers: number[] = [];
  let cleaned = false;
  let coalesced = false;

  const clearRetries = () => {
    for (const id of retryTimers) window.clearTimeout(id);
    retryTimers.length = 0;
  };

  const run = () => {
    if (cleaned) return;
    onForeground();
  };

  const onForegroundEvent = () => {
    if (cleaned || coalesced) return;
    coalesced = true;
    queueMicrotask(() => {
      coalesced = false;
    });
    run();
    clearRetries();
    for (const delay of THEME_FOREGROUND_RETRY_DELAYS_MS) {
      retryTimers.push(window.setTimeout(run, delay));
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') onForegroundEvent();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const capHandles: PluginListenerHandle[] = [];

  const track = (pending: Promise<PluginListenerHandle>) => {
    void pending.then((handle) => {
      if (cleaned) {
        void handle.remove();
        return;
      }
      capHandles.push(handle);
    });
  };

  if (isCapacitor()) {
    track(
      App.addListener('resume', () => {
        onForegroundEvent();
      }),
    );
    track(
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onForegroundEvent();
      }),
    );
  }

  return () => {
    cleaned = true;
    coalesced = false;
    clearRetries();
    document.removeEventListener('visibilitychange', onVisibility);
    for (const handle of capHandles) {
      void handle.remove();
    }
    capHandles.length = 0;
  };
}
