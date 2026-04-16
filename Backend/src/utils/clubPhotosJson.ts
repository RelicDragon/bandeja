export type ClubPhotoStored = { thumbnailUrl: string; originalUrl: string };

export function parseClubPhotosJson(value: unknown): ClubPhotoStored[] {
  if (!Array.isArray(value)) return [];
  const out: ClubPhotoStored[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const o = (item as { originalUrl?: unknown; thumbnailUrl?: unknown }).originalUrl;
    const t = (item as { originalUrl?: unknown; thumbnailUrl?: unknown }).thumbnailUrl;
    if (typeof o === 'string' && typeof t === 'string' && o && t) {
      out.push({ originalUrl: o, thumbnailUrl: t });
    }
  }
  return out;
}

export function isOurChatStorageImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim();
  return u.includes('/uploads/chat/originals/') || u.includes('/uploads/chat/thumbnails/');
}

/** Club review photos use the same chat image pipeline. */
export function isOurClubReviewPhotoPair(originalUrl: string, thumbnailUrl: string): boolean {
  const o = originalUrl.trim();
  const t = thumbnailUrl.trim();
  return o.includes('/uploads/chat/originals/') && t.includes('/uploads/chat/thumbnails/');
}
