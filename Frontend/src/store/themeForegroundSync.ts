import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isCapacitor } from '@/utils/capacitor';

export function startThemeForegroundSync(onForeground: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') onForeground();
  };
  document.addEventListener('visibilitychange', onVisibility);

  let cleaned = false;
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
    track(App.addListener('resume', () => {
      onForeground();
    }));
    track(
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onForeground();
      }),
    );
  }

  return () => {
    cleaned = true;
    document.removeEventListener('visibilitychange', onVisibility);
    for (const handle of capHandles) {
      void handle.remove();
    }
    capHandles.length = 0;
  };
}
