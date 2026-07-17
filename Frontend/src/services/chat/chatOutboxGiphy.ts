import { importGiphyGif, type GiphyImportResult, type GiphySearchItem } from '@/api/giphy';
import { bumpMyChatMediaRecent, type ChatMediaRecent } from '@/api/stickers';
import { bumpCachedChatMediaRecent } from '@/services/stickers/stickerPrefsCache';
import type { PendingGiphyOutboxMedia } from './chatLocalDb';

type GiphyImporter = (
  downloadUrl: string,
  options?: { signal?: AbortSignal }
) => Promise<GiphyImportResult>;

export function toPendingGiphyOutboxMedia(item: GiphySearchItem): PendingGiphyOutboxMedia {
  return {
    provider: 'GIPHY',
    ...item,
  };
}

export async function importPendingGiphyOutboxMedia(
  pending: PendingGiphyOutboxMedia,
  signal?: AbortSignal,
  importer: GiphyImporter = importGiphyGif
): Promise<GiphyImportResult> {
  const imported = await importer(pending.downloadUrl, { signal });
  if (
    /giphy\.com/i.test(imported.mediaUrl) ||
    /giphy\.com/i.test(imported.thumbnailUrl)
  ) {
    throw new Error('giphy_hotlink_rejected');
  }
  return imported;
}

export function persistSentGiphyRecent(
  pending: PendingGiphyOutboxMedia,
  userId: string | undefined
): void {
  if (!userId) return;
  const recent: ChatMediaRecent = {
    kind: 'GIF',
    ...pending,
  };
  bumpCachedChatMediaRecent(userId, recent);
  void bumpMyChatMediaRecent(recent).catch(() => undefined);
}
