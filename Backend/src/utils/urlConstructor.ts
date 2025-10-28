import { config } from '../config/env';

export class UrlConstructor {
  private static getImageBaseUrl(): string {
    return process.env.IMAGE_BASE_URL || `http://localhost:${config.port}`;
  }

  static constructImageUrl(imagePath: string): string {
    if (!imagePath) return '';
    return `${this.getImageBaseUrl()}${imagePath}`;
  }
}
