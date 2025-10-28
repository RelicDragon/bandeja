/// <reference types="vite/client" />

// Environment configuration for media URLs
export const config = {
  // Media base URL - can be local server or CDN
  mediaBaseUrl: import.meta.env.VITE_MEDIA_BASE_URL || 'http://localhost:3000',
  
  // API base URL
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  
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