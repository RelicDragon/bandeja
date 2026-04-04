import { create } from 'zustand';
import { isCapacitor } from './capacitor';
import { triggerForegroundChatSync } from '@/utils/foregroundChatSyncRegistry';

interface NetworkState {
  isOnline: boolean;
  setOnline: (online: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true, // Start optimistically as online
  setOnline: (online: boolean) => set({ isOnline: online }),
}));

// For web browsers (not Capacitor) - use browser API
export const initNetworkListener = () => {
  // Skip browser listeners in Capacitor - we use Network plugin instead
  if (isCapacitor()) {
    return () => {}; // Return empty cleanup function
  }

  let wasOnline = typeof navigator !== 'undefined' && navigator.onLine;

  const updateOnlineStatus = () => {
    const online = navigator.onLine;
    const prev = wasOnline;
    wasOnline = online;
    useNetworkStore.getState().setOnline(online);
    console.log(`Network status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
    if (online && !prev) {
      triggerForegroundChatSync();
    }
  };

  // Set initial status
  updateOnlineStatus();

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  return () => {
    window.removeEventListener('online', updateOnlineStatus);
    window.removeEventListener('offline', updateOnlineStatus);
  };
};

