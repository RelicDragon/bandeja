import type { PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { isCapacitor } from './capacitor';
import { useNetworkStore } from './networkStatus';

let networkListenerHandle: PluginListenerHandle | null = null;

export const setupCapacitorNetwork = async () => {
  if (!isCapacitor()) {
    return;
  }

  try {
    const status = await Network.getStatus();
    console.log('Initial network status:', status);
    useNetworkStore.getState().setOnline(status.connected);

    if (networkListenerHandle) {
      networkListenerHandle.remove();
      networkListenerHandle = null;
    }
    networkListenerHandle = await Network.addListener('networkStatusChange', (status) => {
      console.log('Network status changed:', status);
      useNetworkStore.getState().setOnline(status.connected);
    });
  } catch (error) {
    console.error('Error setting up Capacitor network listener:', error);
  }
};

export const cleanupCapacitorNetwork = () => {
  if (networkListenerHandle) {
    networkListenerHandle.remove();
    networkListenerHandle = null;
  }
};

