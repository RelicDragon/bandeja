import { registerPlugin } from '@capacitor/core';

interface SafePushRegistrationPlugin {
  register(): Promise<void>;
}

const SafePushRegistration = registerPlugin<SafePushRegistrationPlugin>('SafePushRegistration');

/**
 * Starts Android FCM registration without allowing a missing or broken Firebase setup to kill
 * Capacitor's plugin thread (and therefore the whole app process).
 */
export async function registerAndroidPushSafely(): Promise<void> {
  await SafePushRegistration.register();
}
