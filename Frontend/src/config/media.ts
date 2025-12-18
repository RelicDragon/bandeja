/// <reference types="vite/client" />

import { isCapacitor } from '@/utils/capacitor';

const getApiBaseUrl = () => {
  if (isCapacitor()) {
    return 'https://bandeja.me/api';
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
};

export const config = {
  // API base URL
  apiBaseUrl: getApiBaseUrl(),
  
  // Telegram bot URL
  telegramBotUrl: import.meta.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/bandeja_padel_dev_bot',
};