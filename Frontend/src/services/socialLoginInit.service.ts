import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';
import { config } from '@/config/media';

let initialized = false;

export async function initializeSocialLogin() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (initialized) {
    return;
  }

  if (!config.googleWebClientId) {
    console.warn('Google Web Client ID not configured, skipping social login initialization');
    return;
  }

  const webClientId = config.googleWebClientId;
  const iosClientId = config.googleIOSClientId || webClientId;

  try {
    await SocialLogin.initialize({
      google: {
        webClientId: webClientId,
        iOSClientId: iosClientId,
        mode: 'online',
      },
    });
    initialized = true;
  } catch (error) {
    console.error('Failed to initialize social login:', error);
  }
}
