/**
 * Pick which catalog URL to render for a sticker.
 * Reduced motion always prefers static; otherwise animated when present.
 */
export function resolveStickerDisplayUrl(params: {
  staticUrl?: string | null;
  animatedUrl?: string | null;
  reduceMotion: boolean;
}): string | null {
  const staticUrl = params.staticUrl?.trim() || null;
  const animatedUrl = params.animatedUrl?.trim() || null;
  if (params.reduceMotion) return staticUrl;
  return animatedUrl || staticUrl;
}

export type StickerMotionMode = 'animated' | 'static' | 'none';

export function resolveStickerMotionMode(params: {
  staticUrl?: string | null;
  animatedUrl?: string | null;
  reduceMotion: boolean;
}): StickerMotionMode {
  const url = resolveStickerDisplayUrl(params);
  if (!url) return 'none';
  if (params.reduceMotion) return 'static';
  const animatedUrl = params.animatedUrl?.trim() || null;
  return animatedUrl && url === animatedUrl ? 'animated' : 'static';
}

/**
 * After an `<img>` error: if animated failed and static differs, fall back to static.
 * Otherwise give up (caller shows emoji).
 */
export function nextStickerUrlAfterImgError(params: {
  failedUrl: string;
  staticUrl?: string | null;
  animatedUrl?: string | null;
}): string | null {
  const failed = params.failedUrl.trim();
  const staticUrl = params.staticUrl?.trim() || null;
  const animatedUrl = params.animatedUrl?.trim() || null;
  if (!failed) return null;
  if (animatedUrl && failed === animatedUrl && staticUrl && staticUrl !== failed) {
    return staticUrl;
  }
  return null;
}
