import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import type { StorySegment } from '@/api/stories';
import { ensureChatMediaDownloaded } from '@/services/chat/chatMediaDownloadManager';

export function preloadStorySegmentMedia(segment: StorySegment | undefined): void {
  if (!segment) return;
  if (segment.sourceType !== 'USER_STORY_ITEM' && segment.sourceType !== 'GAME_PHOTO') return;

  const url = resolveChatMediaUrl(segment.media.url);
  void ensureChatMediaDownloaded(url).catch(() => {});

  if (segment.media.type === 'VIDEO' && segment.sourceType === 'USER_STORY_ITEM') {
    const thumb = segment.media.thumbnailUrl;
    if (thumb) {
      const thumbUrl = resolveChatMediaUrl(thumb);
      void ensureChatMediaDownloaded(thumbUrl).catch(() => {});
    }
    const video = document.createElement('video');
    video.preload = 'auto';
    video.src = url;
    return;
  }

  const img = new Image();
  img.src = url;
}
