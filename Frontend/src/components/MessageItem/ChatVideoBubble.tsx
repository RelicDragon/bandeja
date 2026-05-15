import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ChatMessage } from '@/api/chat';
import { formatDurationClock, resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import { useChatMediaDownload } from '@/hooks/useChatMediaDownload';
import { useChatVideoPlaybackUrl } from '@/hooks/useChatVideoPlaybackUrl';
import { ensureChatMediaDownloaded } from '@/services/chat/chatMediaDownloadManager';
import { useVideoPlaybackStore } from '@/store/videoPlaybackStore';
import { useVideoUploadProgressStore } from '@/store/videoUploadProgressStore';

const INLINE_VISIBLE_RATIO = 0.35;

type ChatVideoBubbleProps = {
  message: ChatMessage;
  isSending?: boolean;
  optimisticId?: string;
  posterUrl: string;
  inlinePlaybackPaused?: boolean;
  onOpenFullscreen?: (videoUrl: string, posterUrl: string) => void;
};

export const ChatVideoBubble: React.FC<ChatVideoBubbleProps> = ({
  message,
  isSending = false,
  optimisticId,
  posterUrl,
  inlinePlaybackPaused = false,
  onOpenFullscreen,
}) => {
  const videoUrl = resolveChatMediaUrl(message.mediaUrls[0] || '');
  const resolvedPoster = resolveChatMediaUrl(posterUrl);
  const durationMs = message.videoDurationMs ?? 0;
  const download = useChatMediaDownload(videoUrl.startsWith('blob:') ? undefined : videoUrl);
  const uploadProgress = useVideoUploadProgressStore((s) =>
    optimisticId ? s.byTempId[optimisticId] : undefined
  );
  const activeId = useVideoPlaybackStore((s) => s.activeMessageId);
  const setActive = useVideoPlaybackStore((s) => s.setActive);
  const clearIfActive = useVideoPlaybackStore((s) => s.clearIfActive);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const isRemote = videoUrl.startsWith('http');
  const showUploadProgress = isSending && uploadProgress != null && uploadProgress > 0;
  const showDownloadProgress = isRemote && download.state === 'downloading';
  const showProgress = showUploadProgress || showDownloadProgress;
  const progressValue = showUploadProgress ? uploadProgress! : download.progress;
  const canPlay =
    !isSending && (videoUrl.startsWith('blob:') || download.state === 'cached');
  const playbackUrl = useChatVideoPlaybackUrl(videoUrl, canPlay);

  useEffect(() => {
    if (!isRemote || download.state === 'cached') return;
    void ensureChatMediaDownloaded(videoUrl).catch(() => {});
  }, [isRemote, videoUrl, download.state]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(
          !!entry?.isIntersecting && (entry.intersectionRatio ?? 0) >= INLINE_VISIBLE_RATIO
        );
      },
      { threshold: [0, INLINE_VISIBLE_RATIO, 0.5, 1] }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !canPlay) return;
    const shouldPlay =
      isVisible && !inlinePlaybackPaused && (activeId == null || activeId === message.id);
    if (shouldPlay) {
      el.muted = true;
      el.loop = true;
      setActive(message.id);
      void el.play().catch(() => {});
    } else {
      el.pause();
      if (activeId === message.id) clearIfActive(message.id);
    }
  }, [
    activeId,
    canPlay,
    clearIfActive,
    inlinePlaybackPaused,
    isVisible,
    message.id,
    playbackUrl,
    setActive,
  ]);

  useEffect(() => {
    if (activeId === message.id || !videoRef.current) return;
    videoRef.current.pause();
  }, [activeId, message.id]);

  const handleOpenFullscreen = useCallback(() => {
    if (!canPlay || !onOpenFullscreen) return;
    videoRef.current?.pause();
    onOpenFullscreen(videoUrl, posterUrl);
  }, [canPlay, onOpenFullscreen, posterUrl, videoUrl]);

  return (
    <div ref={containerRef} className="relative max-w-[280px] w-full overflow-hidden rounded-xl">
      <button
        type="button"
        className="relative block w-full text-left"
        onClick={handleOpenFullscreen}
        disabled={!canPlay || !onOpenFullscreen}
      >
        {canPlay ? (
          <video
            ref={videoRef}
            src={playbackUrl}
            poster={resolvedPoster}
            muted
            loop
            playsInline
            preload="auto"
            className="w-full max-h-[320px] object-cover bg-black/10 pointer-events-none"
          />
        ) : (
          <img
            src={resolvedPoster}
            alt=""
            className="w-full max-h-[320px] object-cover bg-black/10"
          />
        )}
        {(isSending || showProgress) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/50 p-3">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          </div>
        )}
        {durationMs > 0 && (
          <span className="absolute bottom-1.5 right-2 text-[11px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] pointer-events-none">
            {formatDurationClock(durationMs)}
          </span>
        )}
        {showProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 pointer-events-none">
            <div
              className="h-full bg-white/90"
              style={{ width: `${Math.round(progressValue * 100)}%` }}
            />
          </div>
        )}
      </button>
    </div>
  );
};
