import { create } from 'zustand';

interface NetworkState {
  isOnline: boolean;
  setOnline: (online: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: navigator.onLine,
  setOnline: (online: boolean) => set({ isOnline: online }),
}));

export const initNetworkListener = () => {
  const updateOnlineStatus = () => {
    const online = navigator.onLine;
    useNetworkStore.getState().setOnline(online);
    console.log(`Network status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  return () => {
    window.removeEventListener('online', updateOnlineStatus);
    window.removeEventListener('offline', updateOnlineStatus);
  };
};

