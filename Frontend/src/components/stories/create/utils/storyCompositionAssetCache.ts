type CachedAsset = {
  url: string;
  image: HTMLImageElement | ImageBitmap;
};

const cache = new Map<string, CachedAsset>();

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function getSlideMediaAsset(previewUrl: string): Promise<HTMLImageElement | ImageBitmap> {
  const hit = cache.get(previewUrl);
  if (hit) return hit.image;

  const img = await loadImageElement(previewUrl);
  cache.set(previewUrl, { url: previewUrl, image: img });
  return img;
}

export function invalidateSlideMediaAsset(previewUrl: string): void {
  cache.delete(previewUrl);
}

export function clearSlideMediaAssetCache(): void {
  cache.clear();
}

export function getCachedSlideMediaAsset(previewUrl: string): HTMLImageElement | ImageBitmap | null {
  return cache.get(previewUrl)?.image ?? null;
}
