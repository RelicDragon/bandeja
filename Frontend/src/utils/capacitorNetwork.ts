import { Network } from '@capacitor/network';
import { isCapacitor } from './capacitor';
import { useNetworkStore } from './networkStatus';

export const setupCapacitorNetwork = async () => {
  if (!isCapacitor()) {
    return;
  }

  try {
    const status = await Network.getStatus();
    console.log('Initial network status:', status);
    useNetworkStore.getState().setOnline(status.connected);

    Network.addListener('networkStatusChange', (status) => {
      console.log('Network status changed:', status);
      useNetworkStore.getState().setOnline(status.connected);
    });
  } catch (error) {
    console.error('Error setting up Capacitor network listener:', error);
  }
};

