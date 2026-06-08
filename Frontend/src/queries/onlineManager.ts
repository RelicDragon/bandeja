import { onlineManager } from '@tanstack/react-query';
import { useNetworkStore } from '@/utils/networkStatus';

let initialized = false;

export function setupOnlineManager(): void {
  if (initialized) return;
  initialized = true;

  onlineManager.setEventListener((setOnline) => {
    setOnline(useNetworkStore.getState().isOnline);
    return useNetworkStore.subscribe((state) => {
      setOnline(state.isOnline);
    });
  });
}
