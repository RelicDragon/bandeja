import { useState, useEffect, useCallback } from 'react';

interface CacheEntry {
  url: string;
  blob: Blob;
  blobUrl: string;
  timestamp: number;
}

class ImageCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize = 50; // Maximum number of cached images
  private readonly maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  async getImage(url: string): Promise<string> {
    // Check if image is already cached
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.maxAge) {
      return cached.blobUrl;
    }

    // Remove expired entry
    if (cached) {
      this.cache.delete(url);
      URL.revokeObjectURL(cached.blobUrl);
    }

    // Fetch and cache the image
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Clean up old entries if cache is full
      if (this.cache.size >= this.maxSize) {
        this.cleanup();
      }

      // Create blob URL and cache it
      const blobUrl = URL.createObjectURL(blob);
      this.cache.set(url, {
        url,
        blob,
        blobUrl,
        timestamp: Date.now()
      });

      return blobUrl;
    } catch (error) {
      console.error('Failed to cache image:', error);
      return url; // Fallback to original URL
    }
  }

  private cleanup(): void {
    // Remove oldest entries when cache is full
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 25% of entries
    const toRemove = Math.floor(this.maxSize * 0.25);
    for (let i = 0; i < toRemove; i++) {
      const [url, entry] = entries[i];
      this.cache.delete(url);
      URL.revokeObjectURL(entry.blobUrl);
    }
  }

  clear(): void {
    // Revoke all object URLs
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

// Global cache instance
const imageCache = new ImageCache();

export const useImageCache = (url?: string) => {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadImage = useCallback(async (imageUrl: string) => {
    if (!imageUrl) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const cachedImageUrl = await imageCache.getImage(imageUrl);
      setCachedUrl(cachedImageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image');
      setCachedUrl(imageUrl); // Fallback to original URL
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (url) {
      loadImage(url);
    }
  }, [url, loadImage]);

  return {
    cachedUrl,
    isLoading,
    error,
    loadImage
  };
};

export { imageCache };
