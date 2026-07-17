import { MAX_STICKER_FAVORITES, MAX_STICKER_RECENT } from './stickerConstants';
import { isDirectKlipyMediaUrl } from '../giphyIngest/giphyHosts';
import { isDirectGiphyMediaUrl } from '../giphyIngest/giphyUrlDetect';

export type ChatMediaRecent =
  | { kind: 'STICKER'; stickerId: string }
  | {
      kind: 'GIF';
      provider: 'GIPHY' | 'KLIPY';
      id: string;
      title: string;
      previewUrl: string;
      downloadUrl: string;
      width: number;
      height: number;
    };

/** Dedupe preserving first-seen order (MRU-first lists), trim, cap. */
export function normalizeStickerIdList(ids: unknown, max: number): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeFavoritesInput(ids: unknown): string[] | undefined {
  return normalizeStickerIdList(ids, MAX_STICKER_FAVORITES);
}

function normalizeProviderUrl(raw: unknown, provider: 'GIPHY' | 'KLIPY'): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:') return null;
    if (provider === 'KLIPY') {
      return isDirectKlipyMediaUrl(url.toString()) ? url.toString() : null;
    }
    return isDirectGiphyMediaUrl(url.toString()) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeChatMediaRecentItem(raw: unknown): ChatMediaRecent | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (item.kind === 'STICKER') {
    const stickerId = typeof item.stickerId === 'string' ? item.stickerId.trim() : '';
    return stickerId && stickerId.length <= 100 ? { kind: 'STICKER', stickerId } : null;
  }
  if (
    item.kind !== 'GIF' ||
    (item.provider !== 'GIPHY' && item.provider !== 'KLIPY')
  ) {
    return null;
  }
  const provider = item.provider;
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const previewUrl = normalizeProviderUrl(item.previewUrl, provider);
  const downloadUrl = normalizeProviderUrl(item.downloadUrl, provider);
  if (!id || id.length > 100 || !previewUrl || !downloadUrl) return null;
  const dimension = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(8192, Math.max(1, Math.floor(value)))
      : 200;
  return {
    kind: 'GIF',
    provider,
    id,
    title: typeof item.title === 'string' ? item.title.trim().slice(0, 200) || 'GIF' : 'GIF',
    previewUrl,
    downloadUrl,
    width: dimension(item.width),
    height: dimension(item.height),
  };
}

export function normalizeRecentMediaInput(value: unknown): ChatMediaRecent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: ChatMediaRecent[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const item = normalizeChatMediaRecentItem(raw);
    if (!item) continue;
    const key = item.kind === 'STICKER' ? `sticker:${item.stickerId}` : `gif:${item.provider}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= MAX_STICKER_RECENT) break;
  }
  return result;
}

export function bumpRecentMedia(
  current: unknown,
  item: ChatMediaRecent
): ChatMediaRecent[] {
  const normalized = normalizeRecentMediaInput(current) ?? [];
  const key = item.kind === 'STICKER' ? `sticker:${item.stickerId}` : `gif:${item.provider}:${item.id}`;
  return [
    item,
    ...normalized.filter((existing) => {
      const existingKey =
        existing.kind === 'STICKER'
          ? `sticker:${existing.stickerId}`
          : `gif:${existing.provider}:${existing.id}`;
      return existingKey !== key;
    }),
  ].slice(0, MAX_STICKER_RECENT);
}
