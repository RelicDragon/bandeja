/// <reference types="vite/client" />

import { isCapacitor } from '@/utils/capacitor';

const getMediaBaseUrl = () => {
  if (isCapacitor()) {
    return 'https://bandeja.me';
  }
  return import.meta.env.VITE_MEDIA_BASE_URL || 'http://localhost:3000';
};

const getApiBaseUrl = () => {
  if (isCapacitor()) {
    return 'https://bandeja.me/api';
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
};

// Environment configuration for media URLs
export const config = {
  // Media base URL - can be local server or CDN
  mediaBaseUrl: getMediaBaseUrl(),
  
  // API base URL
  apiBaseUrl: getApiBaseUrl(),
  
  // Telegram bot URL
  telegramBotUrl: import.meta.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/bandeja_padel_dev_bot',
  
  // Helper function to construct full media URL from relative path
  getMediaUrl: (relativePath: string): string => {
    if (!relativePath) return '';
    return `${config.mediaBaseUrl}${relativePath}`;
  },
  
  // Helper function to construct avatar URL
  getAvatarUrl: (avatarPath: string): string => {
    return config.getMediaUrl(avatarPath);
  },
  
  // Helper function to construct original avatar URL
  getOriginalAvatarUrl: (originalPath: string): string => {
    return config.getMediaUrl(originalPath);
  }
};