import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  FullscreenImageZoom,
  type FullscreenImageZoomHandle,
} from '@/components/fullscreenImageViewer/FullscreenImageZoom';
import toast from 'react-hot-toast';
import { copyImageToClipboard } from '@/utils/copyImageToClipboard';
import { downloadImage } from '@/utils/downloadImage';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { OVERLAY_CONTROL_GLASS } from '@/components/ui/overlayControlGlass';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import {
  mediaCacheKeyForSrc,
  readCachedMediaResponse,
  writeCachedMediaResponse,
} from '@/services/chat/chatMediaCache';

interface FullscreenImageViewerProps {
  imageUrl: string;
  onClose: () => void;
  isOpen?: boolean;
  /** Pinch-zoom pan; off avoids crashes when nested under CSS transform ancestors. */
  enableTransform?: boolean;
  modalId?: string;
  /** Game details: Radix dialog breaks under pull-to-refresh transform; use portaled overlay instead. */
  usePortaledOverlay?: boolean;
}

function resolveViewerImageUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;
  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) return imageUrl;
  return resolveChatMediaUrl(imageUrl);
}

function dismissBackdropRgba(offsetY: number): string {
  const opacity = Math.max(0.35, 0.8 - offsetY / 400);
  return `rgba(0,0,0,${opacity})`;
}

export const FullscreenImageViewer: React.FC<FullscreenImageViewerProps> = ({
  imageUrl,
  onClose,
  isOpen = true,
  enableTransform = true,
  modalId = 'fullscreen-image-viewer',
  usePortaledOverlay = false,
}) => {
  const { t } = useTranslation();
  useBackButtonModal(usePortaledOverlay && isOpen, onClose, modalId);
  const zoomRef = useRef<FullscreenImageZoomHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const resetBarRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const shownUrl = resolveViewerImageUrl(imageUrl);
  const resolvedBlobRef = useRef<Blob | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomActive = enableTransform && isOpen;

  useEffect(() => {
    resolvedBlobRef.current = null;
    if (isOpen) zoomRef.current?.resetTransform();
    if (overlayRef.current) overlayRef.current.style.backgroundColor = dismissBackdropRgba(0);
    if (chromeRef.current) chromeRef.current.style.opacity = '1';
    if (resetBarRef.current) resetBarRef.current.style.opacity = '1';
  }, [shownUrl, isOpen]);

  // Prefetch blob for copy/download only — keep <img src> on the original URL
  // so the view never flashes or resets when cache resolves.
  useEffect(() => {
    if (!isOpen || !shownUrl) return;
    if (shownUrl.startsWith('blob:') || shownUrl.startsWith('data:')) return;
    const key = mediaCacheKeyForSrc(shownUrl);
    let cancelled = false;
    void (async () => {
      try {
        const hit = await readCachedMediaResponse(key);
        if (cancelled) return;
        if (hit?.ok) {
          resolvedBlobRef.current = await hit.blob();
          return;
        }
      } catch {
        /* network fallback below */
      }
      try {
        const res = await fetch(key, { mode: 'cors', credentials: 'omit' });
        if (cancelled || !res.ok) return;
        await writeCachedMediaResponse(key, res);
        resolvedBlobRef.current = await res.blob();
      } catch {
        /* copy/download can still use <img> / network */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, shownUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [isOpen]);

  const handleDismissOffsetChange = useCallback((offsetY: number) => {
    if (overlayRef.current) {
      overlayRef.current.style.backgroundColor = dismissBackdropRgba(offsetY);
    }
    const chromeOpacity = offsetY > 40 ? '0.35' : '1';
    if (chromeRef.current) chromeRef.current.style.opacity = chromeOpacity;
    if (resetBarRef.current) resetBarRef.current.style.opacity = chromeOpacity;
  }, []);

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDownloading(true);
      try {
        const img = containerRef.current?.querySelector('img');
        const outcome = await downloadImage(shownUrl, {
          blob: resolvedBlobRef.current,
          img,
        });
        toast.success(
          outcome === 'shared' ? t('media.imageShareOpened') : t('media.imageDownloaded'),
        );
      } catch (error) {
        console.error('Failed to download image:', error);
        toast.error(t('media.downloadImageFailed'));
      } finally {
        setIsDownloading(false);
      }
    },
    [shownUrl, t],
  );

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsCopying(true);
      try {
        const img = containerRef.current?.querySelector('img');
        const outcome = await copyImageToClipboard(shownUrl, {
          blob: resolvedBlobRef.current,
          img,
        });
        toast.success(
          outcome === 'shared' ? t('media.imageShareOpened') : t('media.imageCopied'),
        );
      } catch (error) {
        console.error('Failed to copy image:', error);
        toast.error(t('media.copyImageFailed'));
      } finally {
        setIsCopying(false);
      }
    },
    [shownUrl, t],
  );

  const resetView = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    zoomRef.current?.resetTransform();
    handleDismissOffsetChange(0);
  }, [handleDismissOffsetChange]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      // Image taps are owned by FullscreenImageZoom (tap / double-tap).
      if ((e.target as HTMLElement).closest('button')) return;
      if ((e.target as HTMLElement).closest('[data-fullscreen-image-zoom]')) return;
      if (zoomRef.current?.isZoomed()) return;
      onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const viewerBody = (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[1] flex items-center justify-center bg-transparent touch-none overscroll-none"
      onClick={handleBackdropClick}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      <div className="relative z-10 h-full w-full min-h-0 min-w-0 pointer-events-auto">
        {enableTransform ? (
          <FullscreenImageZoom
            ref={zoomRef}
            src={shownUrl}
            active={zoomActive}
            onTap={onClose}
            onDismiss={onClose}
            onDismissOffsetChange={handleDismissOffsetChange}
          />
        ) : (
          <button
            type="button"
            className="flex h-full w-full items-center justify-center bg-transparent p-0 border-0"
            onClick={onClose}
          >
            <img
              src={shownUrl}
              alt="Fullscreen view"
              draggable={false}
              decoding="async"
              fetchPriority="high"
              className="max-h-full max-w-full object-contain"
            />
          </button>
        )}
      </div>

      <div
        ref={chromeRef}
        className="absolute top-4 right-4 z-50 flex gap-3 pointer-events-auto"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)',
          right: 'max(1rem, env(safe-area-inset-right))',
          transition: 'opacity 0.15s',
        }}
      >
        <button
          type="button"
          onClick={handleCopy}
          disabled={isCopying}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${OVERLAY_CONTROL_GLASS} disabled:cursor-not-allowed disabled:opacity-50`}
          aria-label={t('media.copyImage')}
        >
          {isCopying ? <Loader2 size={22} className="animate-spin" /> : <Copy size={22} />}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${OVERLAY_CONTROL_GLASS} disabled:cursor-not-allowed disabled:opacity-50`}
          aria-label={t('media.download')}
        >
          {isDownloading ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <Download size={22} />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${OVERLAY_CONTROL_GLASS}`}
          aria-label={t('common.close')}
        >
          <X size={22} />
        </button>
      </div>

      {enableTransform ? (
        <div
          ref={resetBarRef}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
          style={{
            bottom: 'max(2rem, env(safe-area-inset-bottom))',
            transition: 'opacity 0.15s',
          }}
        >
          <button
            type="button"
            onClick={resetView}
            className={`rounded-xl px-6 py-3 text-sm font-medium ${OVERLAY_CONTROL_GLASS}`}
          >
            {t('media.resetView')}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (usePortaledOverlay) {
    const overlay = (
      <div
        ref={overlayRef}
        className="fullscreen-backdrop-overlay fixed inset-0 z-[100] touch-none overscroll-none"
        style={{ backgroundColor: dismissBackdropRgba(0) }}
        data-state="open"
        role="dialog"
        aria-modal="true"
      >
        {viewerBody}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
  }

  return (
    <FullScreenDialog
      open={isOpen}
      onClose={onClose}
      modalId={modalId}
      closeOnInteractOutside={false}
      overlayClassName="fullscreen-backdrop-overlay"
      contentClassName="fullscreen-content-fade-animate overflow-hidden"
      bodyClassName="!overflow-hidden overscroll-none touch-none"
    >
      {viewerBody}
    </FullScreenDialog>
  );
};
