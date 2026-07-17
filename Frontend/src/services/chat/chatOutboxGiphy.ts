import { importGiphyGif, type GiphyImportResult, type GiphySearchItem } from '@/api/giphy';
import { bumpMyChatMediaRecent, type ChatMediaRecent } from '@/api/stickers';
import { bumpCachedChatMediaRecent } from '@/services/stickers/stickerPrefsCache';
import { isGifProviderHostedUrl } from '@/utils/gifProviderUrl';
import { withChatSyncRetry } from '@/services/chat/chatHttpRetry';
import type { PendingGiphyOutboxMedia } from './chatLocalDb';

type GiphyImporter = (
  downloadUrl: string,
  options?: { signal?: AbortSignal }
) => Promise<GiphyImportResult>;

export function toPendingGiphyOutboxMedia(item: GiphySearchItem): PendingGiphyOutboxMedia {
  return {
    provider: item.provider,
    id: item.id,
    title: item.title,
    previewUrl: item.previewUrl,
    downloadUrl: item.downloadUrl,
    width: item.width,
    height: item.height,
  };
}

export async function importPendingGiphyOutboxMedia(
  pending: PendingGiphyOutboxMedia,
  signal?: AbortSignal,
  importer: GiphyImporter = importGiphyGif
): Promise<GiphyImportResult> {
  // Retry 429/503/transient network — importBusy and rate-limit are expected under burst sends.
  const imported = await withChatSyncRetry(
    'giphyImport',
    () => importer(pending.downloadUrl, { signal }),
    6
  );
  if (
    isGifProviderHostedUrl(imported.mediaUrl) ||
    isGifProviderHostedUrl(imported.thumbnailUrl)
  ) {
    throw new Error('gif_provider_hotlink_rejected');
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
