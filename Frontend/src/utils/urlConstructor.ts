import { isCapacitor } from './capacitor';

export class UrlConstructor {
  private static getImageBaseUrl(): string {
    if (isCapacitor()) {
      return 'https://bandeja.me';
    }
    return import.meta.env.VITE_MEDIA_BASE_URL || 'http://localhost:3000';
  }

  static constructImageUrl(imagePath: string): string {
    if (!imagePath) return '';
    
    // If the path is already a full URL, return it as is
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    
    return `${this.getImageBaseUrl()}${imagePath}`;
  }
}
