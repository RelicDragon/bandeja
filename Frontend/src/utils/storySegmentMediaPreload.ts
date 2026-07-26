import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import type { StorySegment } from '@/api/stories';
import { ensureChatMediaDownloaded } from '@/services/chat/chatMediaDownloadManager';

let preloadVideoEl: HTMLVideoElement | null = null;
let preloadImageEl: HTMLImageElement | null = null;

function releasePreloadVideo(): void {
  if (!preloadVideoEl) return;
  preloadVideoEl.removeAttribute('src');
  preloadVideoEl.load();
  preloadVideoEl = null;
}

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
    releasePreloadVideo();
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    preloadVideoEl = video;
    return;
  }

  if (!preloadImageEl) preloadImageEl = new Image();
  preloadImageEl.src = url;
}

/** Test/harness helper — drop retained preload media. */
export function resetStorySegmentMediaPreload(): void {
  releasePreloadVideo();
  preloadImageEl = null;
}
