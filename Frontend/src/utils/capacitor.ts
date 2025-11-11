import { Capacitor } from '@capacitor/core';

export const isCapacitor = () => Capacitor.isNativePlatform();

export const isIOS = () => Capacitor.getPlatform() === 'ios';

export const isAndroid = () => Capacitor.getPlatform() === 'android';

export const getCapacitorPlatform = () => {
  if (!isCapacitor()) return null;
  return Capacitor.getPlatform();
};

