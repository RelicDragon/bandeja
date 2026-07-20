import { isGifProviderHostedUrl } from '@/utils/gifProviderUrl';

/**
 * Does this chat media URL point at an animated GIF?
 *
 * Re-hosted provider imports keep a `giphy.{gif|webp|png}` stem (animated webp/png
 * are common), and hosted GIFs end with `.gif`. GIFs pasted straight from a provider
 * are caught by the host check.
 */
export function looksLikeGifMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (isGifProviderHostedUrl(url)) return true;
  try {
    const path = new URL(url, 'https://local.invalid').pathname.toLowerCase();
    if (path.endsWith('.gif') || path.includes('.gif.')) return true;
    return /\/giphy\.(gif|webp|png)$/i.test(path);
  } catch {
    return /\.gif($|\?)/i.test(url) || /\/giphy\.(gif|webp|png)($|\?)/i.test(url);
  }
}
