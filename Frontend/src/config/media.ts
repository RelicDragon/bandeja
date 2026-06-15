/// <reference types="vite/client" />

import { resolveNativeApiBaseUrl } from '@/api/apiBaseUrl';

export const config = {
  // API base URL
  apiBaseUrl: resolveNativeApiBaseUrl(),
  
  // Telegram bot URL
  telegramBotUrl: import.meta.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/bandeja_padel_dev_bot',
  
  // Apple Sign In
  appleClientId: import.meta.env.VITE_APPLE_CLIENT_ID || 'com.funified.bandeja',
  
  // Google Sign In
  googleWebClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '',
  googleIOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || '',
  googleAndroidClientId: import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID || '',
};