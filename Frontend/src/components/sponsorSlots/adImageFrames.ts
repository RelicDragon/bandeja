import type { AdPlacementPayload } from '@/api/sponsorPlacements';

function normalizeFrameSet(canonicalUrl: string, urls: string[] | undefined): string[] {
  const validUrls = (urls ?? []).filter((url) => typeof url === 'string' && url.trim().length > 0);
  if (validUrls.length === 0) return [canonicalUrl];
  if (validUrls[0] === canonicalUrl) return validUrls;
  return [canonicalUrl, ...validUrls.filter((url) => url !== canonicalUrl)];
}

export function resolveAdImageFrames(payload: AdPlacementPayload, isDark: boolean): string[] {
  const lightFrames = normalizeFrameSet(payload.imageUrl, payload.imageUrls);
  if (!isDark || !payload.imageUrlDark) return lightFrames;

  const darkFrames = normalizeFrameSet(payload.imageUrlDark, payload.imageUrlsDark);
  return lightFrames.map((lightFrame, index) => darkFrames[index] ?? lightFrame);
}
