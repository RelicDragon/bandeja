import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, PictureInPicture2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { OVERLAY_CONTROL_GLASS } from '@/components/ui/overlayControlGlass';
import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import { useVideoPlaybackStore } from '@/store/videoPlaybackStore';
import { ensureChatMediaDownloaded } from '@/services/chat/chatMediaDownloadManager';
import { useChatMediaDownload } from '@/hooks/useChatMediaDownload';
import { isCapacitor, isAndroid } from '@/utils/capacitor';
import { mediaCacheKeyForSrc, readCachedMediaResponse } from '@/services/chat/chatMediaCache';
import {
  isVideoPictureInPictureSupported,
  subscribeVideoPictureInPicture,
  toggleVideoPictureInPicture,
} from '@/utils/videoPictureInPicture';

type FullscreenVideoViewerProps = {
  videoUrl: string;
  posterUrl?: string;
  messageId?: string;
  onClose: () => void;
  isOpen?: boolean;
};

export const FullscreenVideoViewer: React.FC<FullscreenVideoViewerProps> = ({
  videoUrl,
  posterUrl,
  messageId,
  onClose,
  isOpen = true,
}) => {
  const { t } = useTranslation();
  const resolved = resolveChatMediaUrl(videoUrl);
  const download = useChatMediaDownload(resolved.startsWith('blob:') ? undefined : resolved);
  const setActive = useVideoPlaybackStore((s) => s.setActive);
  const clearIfActive = useVideoPlaybackStore((s) => s.clearIfActive);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState(resolved);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (messageId) setActive(messageId);
    return () => {
      if (messageId) clearIfActive(messageId);
    };
  }, [isOpen, messageId, setActive, clearIfActive]);

  const startFullscreenPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isOpen) return;
    video.muted = false;
    void video.play().catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    setPlaybackUrl(resolved);
  }, [resolved]);

  useEffect(() => {
    if (!isOpen || resolved.startsWith('blob:') || resolved.startsWith('data:')) return;
    const key = mediaCacheKeyForSrc(resolved);
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const hit = await readCachedMediaResponse(key);
        if (cancelled) return;
        if (hit?.ok) {
          const blob = await hit.blob();
          const u = URL.createObjectURL(blob);
          revoked = u;
          setPlaybackUrl(u);
        }
      } catch {
        /* keep network src */
      }
      try {
        await ensureChatMediaDownloaded(resolved);
        if (cancelled || revoked) return;
        const hit = await readCachedMediaResponse(key);
        if (hit?.ok) {
          const blob = await hit.blob();
          const u = URL.createObjectURL(blob);
          revoked = u;
          setPlaybackUrl(u);
        }
      } catch {
        /* keep network src */
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [isOpen, resolved, retryKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      setPipSupported(false);
      return;
    }
    setPipSupported(isVideoPictureInPictureSupported(video));
    return subscribeVideoPictureInPicture(video, setPipActive);
  }, [playbackUrl, retryKey, isOpen]);

  const handlePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isVideoPictureInPictureSupported(video)) return;
    try {
      if (video.paused) {
        await video.play();
      }
      await toggleVideoPictureInPicture(video);
    } catch {
      /* unsupported or user dismissed */
    }
  }, []);

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDownloading(true);
      try {
        const src = playbackUrl;
        if (isCapacitor()) {
          const response = await fetch(src);
          const blob = await response.blob();
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1] ?? '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const fileName = `video-${Date.now()}.mp4`;
          await Filesystem.writeFile({
            path: fileName,
            data: base64,
            directory: isAndroid() ? Directory.ExternalStorage : Directory.Data,
          });
          const fileUri = await Filesystem.getUri({
            path: fileName,
            directory: isAndroid() ? Directory.ExternalStorage : Directory.Data,
          });
          await Share.share({ url: fileUri.uri, dialogTitle: t('media.download') });
        } else {
          const response = await fetch(src);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `video-${Date.now()}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
      } catch {
        /* noop */
      } finally {
        setIsDownloading(false);
      }
    },
    [playbackUrl, t]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    setSwipeOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;
    const deltaX = Math.abs(touch.clientX - touchStartX.current);
    if (deltaY > 0 && deltaY > deltaX) {
      e.preventDefault();
      setSwipeOffset(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const touch = e.changedTouches[0];
      const deltaY = touch.clientY - touchStartY.current;
      const deltaX = Math.abs(touch.clientX - (touchStartX.current || 0));
      if (deltaY > 100 && deltaY > deltaX) {
        onClose();
      } else {
        setSwipeOffset(0);
      }
      touchStartY.current = null;
      touchStartX.current = null;
    },
    [onClose]
  );

  const showSpinner = resolved.startsWith('http') && download.state === 'downloading';

  return (
    <FullScreenDialog
      open={isOpen}
      onClose={onClose}
      modalId="fullscreen-video-viewer"
      closeOnInteractOutside={false}
    >
      <div
        className="relative flex h-full w-full items-center justify-center bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: swipeOffset > 0 ? `translateY(${swipeOffset}px)` : undefined,
          opacity: swipeOffset > 0 ? Math.max(0.35, 1 - swipeOffset / 320) : undefined,
          transition: swipeOffset > 0 ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
        }}
      >
        <div
          className="absolute top-4 right-4 z-20 flex gap-2"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        >
          {pipSupported ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handlePiP();
              }}
              className={`p-2 rounded-full ${OVERLAY_CONTROL_GLASS} ${pipActive ? 'ring-2 ring-white/60' : ''}`}
              aria-label={t('chat.videoPictureInPicture', { defaultValue: 'Picture in picture' })}
            >
              <PictureInPicture2 className="w-6 h-6 text-white" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className={`p-2 rounded-full ${OVERLAY_CONTROL_GLASS} disabled:opacity-50`}
            aria-label={t('media.download')}
          >
            {isDownloading ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : (
              <Download className="w-6 h-6 text-white" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={`p-2 rounded-full ${OVERLAY_CONTROL_GLASS}`}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
        {showSpinner && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
        )}
        {download.state === 'error' && (
          <button
            type="button"
            className={`absolute z-10 px-4 py-2 rounded-lg ${OVERLAY_CONTROL_GLASS} text-white text-sm`}
            onClick={() => setRetryKey((k) => k + 1)}
          >
            {t('common.retry', { defaultValue: 'Retry' })}
          </button>
        )}
        <video
          ref={videoRef}
          key={`${playbackUrl}-${retryKey}`}
          src={playbackUrl}
          poster={posterUrl ? resolveChatMediaUrl(posterUrl) : undefined}
          controls
          playsInline
          disablePictureInPicture={false}
          className="max-h-full max-w-full"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onLoadedData={startFullscreenPlayback}
          onPlay={() => messageId && setActive(messageId)}
        />
        {showSpinner && download.progress > 0 && (
          <div className="absolute bottom-8 left-8 right-8 h-1 bg-white/20 rounded-full z-10">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: `${Math.round(download.progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </FullScreenDialog>
  );
};
