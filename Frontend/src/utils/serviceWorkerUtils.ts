export const unregisterServiceWorkers = async (): Promise<void> => {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      console.log('All service workers unregistered');
    } catch (error) {
      console.error('Failed to unregister service workers:', error);
    }
  }
};

export const clearAllCaches = async (): Promise<void> => {
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      console.log('All caches cleared');
    } catch (error) {
      console.error('Failed to clear caches:', error);
    }
  }
};

export const resetServiceWorker = async (): Promise<void> => {
  await unregisterServiceWorkers();
  await clearAllCaches();
  console.log('Service worker reset complete');
};

