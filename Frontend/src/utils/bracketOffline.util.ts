import { useNetworkStore } from '@/utils/networkStatus';

export function isAppOffline(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return !useNetworkStore.getState().isOnline;
}

export function useIsAppOffline(): boolean {
  const storeOnline = useNetworkStore((s) => s.isOnline);
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return !storeOnline;
}
