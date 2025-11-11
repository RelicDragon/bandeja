import { create } from 'zustand';
import { isCapacitor } from './capacitor';

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

  const updateOnlineStatus = () => {
    const online = navigator.onLine;
    useNetworkStore.getState().setOnline(online);
    console.log(`Network status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
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

