import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isCapacitor = () => Capacitor.isNativePlatform();

export const isIOS = () => Capacitor.getPlatform() === 'ios';

export const isAndroid = () => Capacitor.getPlatform() === 'android';

export const getCapacitorPlatform = () => {
  if (!isCapacitor()) return null;
  return Capacitor.getPlatform();
};

export const getAppInfo = async () => {
  if (!isCapacitor()) return null;
  
  try {
    const info = await App.getInfo();
    return {
      version: info.version,
      buildNumber: info.build,
      platform: getCapacitorPlatform(),
    };
  } catch (error) {
    console.error('Failed to get app info:', error);
    return null;
  }
};
