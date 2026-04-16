import type { ClubPhoto } from '@/types';

export function normalizeClubPhotos(raw: unknown): ClubPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: ClubPhoto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = (item as { originalUrl?: unknown; thumbnailUrl?: unknown }).originalUrl;
    const t = (item as { originalUrl?: unknown; thumbnailUrl?: unknown }).thumbnailUrl;
    if (typeof o === 'string' && typeof t === 'string' && o && t) {
      out.push({ originalUrl: o, thumbnailUrl: t });
    }
  }
  return out;
}
