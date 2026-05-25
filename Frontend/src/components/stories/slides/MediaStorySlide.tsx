import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import { ensureChatMediaDownloaded } from '@/services/chat/chatMediaDownloadManager';
import { OVERLAY_CONTROL_GLASS } from '@/components/ui/overlayControlGlass';
import { isOverlayStyleV1, isOverlayStyleV2 } from '@/components/stories/create/types/storyEditor.types';
import { getMediaStoryOverlayVisibility } from './mediaStoryOverlay';
import { STORY_VIDEO_STALL_MS } from '@/components/stories/storyPlayback';
import { useStoryViewerEngagementPaused } from '@/components/stories/viewer/storyViewerEngagementPause';
import type { StorySegment } from '@/api/stories';
import { MediaStoryOverlayV2 } from './MediaStoryOverlayV2';

const MEDIA_CLASS = 'h-full w-full object-cover';

const STORY_MEDIA_FRAME_CLASS =
  'relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden bg-black';

type MediaStorySlideProps = {
  segment: Extract<StorySegment, { sourceType: 'USER_STORY_ITEM' | 'GAME_PHOTO' }>;
  isActive: boolean;
  paused: boolean;
  onVideoEnded: () => void;
  onVideoError: () => void;
  onVideoProgress?: (progress: number) => void;
  onVideoDurationMs?: (durationMs: number) => void;
  replayNonce?: number;
};

export function MediaStorySlide({
  segment,
  isActive,
  paused: userPaused,
  onVideoEnded,
  onVideoError,
  onVideoProgress,
  onVideoDurationMs,
  replayNonce = 0,
}: MediaStorySlideProps) {
  const engagementPaused = useStoryViewerEngagementPaused();
  const paused = userPaused || engagementPaused;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const lastPlaybackProgressRef = useRef(0);
  const lastPlaybackTickRef = useRef(0);
  const isVideo = segment.sourceType === 'USER_STORY_ITEM' && segment.media.type === 'VIDEO';
  const mediaUrl = resolveChatMediaUrl(segment.media.url);
  const posterUrl =
    segment.sourceType === 'USER_STORY_ITEM' && segment.media.type === 'VIDEO'
      ? segment.media.thumbnailUrl
      : undefined;
  const overlayText =
    segment.sourceType === 'USER_STORY_ITEM' ? segment.media.overlayText : undefined;
  const rawOverlayStyle =
    segment.sourceType === 'USER_STORY_ITEM' ? segment.media.overlayStyle : undefined;

  const overlayV2 = isOverlayStyleV2(rawOverlayStyle) ? rawOverlayStyle : null;
  const overlayV1 = isOverlayStyleV1(rawOverlayStyle) ? rawOverlayStyle : null;
  const { showV2Overlay, showLegacyOverlayText } = getMediaStoryOverlayVisibility(overlayV2, overlayText);

  const handleMediaError = useCallback(() => {
    if (retryCount < 2) setRetryCount((c) => c + 1);
    else onVideoError();
  }, [retryCount, onVideoError]);

  useEffect(() => {
    setRetryCount(0);
    lastPlaybackProgressRef.current = 0;
    lastPlaybackTickRef.current = 0;
  }, [mediaUrl]);

  useEffect(() => {
    if (!isActive || !mediaUrl) {
      if (isActive && !mediaUrl) onVideoError();
      return;
    }
    void ensureChatMediaDownloaded(mediaUrl).catch(() => {});
  }, [isActive, mediaUrl, onVideoError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || replayNonce === 0) return;
    video.currentTime = 0;
    lastPlaybackProgressRef.current = 0;
    lastPlaybackTickRef.current = 0;
    onVideoProgress?.(0);
    if (isActive && !paused) void video.play().catch(() => handleMediaError());
  }, [replayNonce, isVideo, isActive, paused, onVideoProgress, handleMediaError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    video.muted = muted;
    if (isActive && !paused) {
      void video.play().catch(() => handleMediaError());
    } else {
      video.pause();
    }
  }, [isActive, paused, muted, isVideo, mediaUrl, retryCount, handleMediaError]);

  useEffect(() => {
    if (!isActive || !isVideo || paused) return;

    const checkStall = () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      const progress = video.duration > 0 ? video.currentTime / video.duration : 0;
      const now = Date.now();
      if (progress > lastPlaybackProgressRef.current + 0.01) {
        lastPlaybackProgressRef.current = progress;
        lastPlaybackTickRef.current = now;
        return;
      }
      if (lastPlaybackTickRef.current === 0) {
        lastPlaybackTickRef.current = now;
        return;
      }
      if (now - lastPlaybackTickRef.current >= STORY_VIDEO_STALL_MS) {
        handleMediaError();
      }
    };

    const id = setInterval(checkStall, 1000);
    return () => clearInterval(id);
  }, [isActive, isVideo, paused, mediaUrl, retryCount, handleMediaError]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video?.duration || !Number.isFinite(video.duration)) return;
    onVideoDurationMs?.(Math.round(video.duration * 1000));
  }, [onVideoDurationMs]);

  const reportVideoProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video?.duration || !Number.isFinite(video.duration)) return;
    const p = Math.min(1, video.currentTime / video.duration);
    lastPlaybackProgressRef.current = p;
    lastPlaybackTickRef.current = Date.now();
    onVideoProgress?.(p);
  }, [onVideoProgress]);

  useEffect(() => {
    if (!isActive || !isVideo || paused) return;
    let rafId = 0;
    const tick = () => {
      reportVideoProgress();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, isVideo, paused, mediaUrl, retryCount, reportVideoProgress]);

  const positionClass =
    overlayV1?.position === 'top'
      ? 'top-[20%]'
      : overlayV1?.position === 'bottom'
        ? 'bottom-[18%]'
        : 'top-1/2 -translate-y-1/2';
  const textTheme =
    overlayV1?.theme === 'light' ? 'text-gray-900 bg-white/85' : 'text-white bg-black/45';

  const mediaNode = isVideo ? (
    <>
      <video
        ref={videoRef}
        key={`${mediaUrl}-${retryCount}`}
        src={mediaUrl}
        poster={posterUrl ? resolveChatMediaUrl(posterUrl) : undefined}
        className={MEDIA_CLASS}
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={onVideoEnded}
        onError={handleMediaError}
        onTimeUpdate={reportVideoProgress}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMuted((m) => !m);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={`absolute bottom-24 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full ${OVERLAY_CONTROL_GLASS}`}
        data-story-interactive
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </>
  ) : (
    <img
      key={`${mediaUrl}-${retryCount}`}
      src={mediaUrl}
      alt=""
      className={MEDIA_CLASS}
      draggable={false}
      onError={handleMediaError}
    />
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div className={STORY_MEDIA_FRAME_CLASS}>{mediaNode}</div>

      {showV2Overlay && overlayV2 ? <MediaStoryOverlayV2 overlayStyle={overlayV2} /> : null}

      {showLegacyOverlayText ? (
        <div className={`absolute inset-x-6 z-10 text-center ${positionClass}`}>
          <p className={`inline-block rounded-xl px-4 py-2 text-lg font-semibold ${textTheme}`}>{overlayText}</p>
        </div>
      ) : null}
    </div>
  );
}
