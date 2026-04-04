import { useChatOfflineStore } from '@/store/chatOfflineStore';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useNetworkStore } from '@/utils/networkStatus';

let activeChatSyncPullDepth = 0;

let pendingSyncingTimer: ReturnType<typeof setTimeout> | null = null;
const SYNCING_DEBOUNCE_MS = 350;

export function setChatBannerSocketConnected(_connected: boolean): void {
  refreshChatOfflineBanner();
}

export function chatSyncPullStarted(): void {
  activeChatSyncPullDepth += 1;
  refreshChatOfflineBanner();
}

export function chatSyncPullEnded(): void {
  activeChatSyncPullDepth = Math.max(0, activeChatSyncPullDepth - 1);
  refreshChatOfflineBanner();
}

function computeDesiredChatConnectionState(): 'OFFLINE' | 'SYNCING' | 'ONLINE' {
  const navOnline = typeof navigator !== 'undefined' && navigator.onLine;
  const net = useNetworkStore.getState().isOnline;
  if (!navOnline || !net) return 'OFFLINE';
  if (activeChatSyncPullDepth > 0 || useChatSyncStore.getState().syncInProgress) return 'SYNCING';
  return 'ONLINE';
}

export function refreshChatOfflineBanner(): void {
  try {
    const desired = computeDesiredChatConnectionState();
    const setState = useChatOfflineStore.getState().setChatConnectionState;

    if (desired === 'OFFLINE') {
      if (pendingSyncingTimer) {
        clearTimeout(pendingSyncingTimer);
        pendingSyncingTimer = null;
      }
      setState('OFFLINE');
      return;
    }

    if (desired === 'ONLINE') {
      if (pendingSyncingTimer) {
        clearTimeout(pendingSyncingTimer);
        pendingSyncingTimer = null;
      }
      setState('ONLINE');
      return;
    }

    const current = useChatOfflineStore.getState().chatConnectionState;
    if (current === 'SYNCING') return;
    if (pendingSyncingTimer) return;
    pendingSyncingTimer = setTimeout(() => {
      pendingSyncingTimer = null;
      if (computeDesiredChatConnectionState() === 'SYNCING') {
        setState('SYNCING');
      }
    }, SYNCING_DEBOUNCE_MS);
  } catch {
    /* ignore */
  }
}
