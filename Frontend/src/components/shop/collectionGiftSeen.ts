/**
 * PRD 355 — "a sparkle on first open".
 *
 * A received gift sparkles once in the owner's Collection and then settles
 * down. There is no `seenAt` column, so the celebration is remembered locally;
 * the worst failure mode is a second sparkle on a new device, which is exactly
 * the right way for this to break.
 */
const STORAGE_KEY = 'bandeja.shop.celebratedGifts';

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Gift ids that have never sparkled for this viewer. */
export function pendingGiftCelebrations(goodsIds: string[]): string[] {
  const seen = new Set(readSeen());
  return goodsIds.filter((id) => !seen.has(id));
}

export function markGiftsCelebrated(goodsIds: string[]): void {
  if (goodsIds.length === 0) return;
  try {
    const next = [...new Set([...readSeen(), ...goodsIds])].slice(-200);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — the sparkle simply repeats next time.
  }
}
