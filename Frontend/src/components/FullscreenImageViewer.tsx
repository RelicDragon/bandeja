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
import { mediaCacheKeyForSrc, readCachedMediaResponse, writeCachedMediaResponse } from '@/services/chat/chatMediaCache';

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
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const zoomRef = useRef<FullscreenImageZoomHandle>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [displayUrl, setDisplayUrl] = useState(imageUrl);
  const resolvedBlobRef = useRef<Blob | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomActive = enableTransform && isOpen;

  useEffect(() => {
    if (isOpen) zoomRef.current?.resetTransform();
  }, [displayUrl, isOpen]);

  useEffect(() => {
    setDisplayUrl(imageUrl);
    resolvedBlobRef.current = null;
  }, [imageUrl]);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) return;
    const key = mediaCacheKeyForSrc(imageUrl);
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const hit = await readCachedMediaResponse(key);
        if (cancelled) return;
        if (hit?.ok) {
          const blob = await hit.blob();
          resolvedBlobRef.current = blob;
          const u = URL.createObjectURL(blob);
          revoked = u;
          setDisplayUrl(u);
          return;
        }
      } catch {
        /* keep network src */
      }
      try {
        const res = await fetch(key, { mode: 'cors', credentials: 'omit' });
        if (cancelled) return;
        if (res.ok) {
          await writeCachedMediaResponse(key, res);
          if (!revoked) {
            const b = await res.blob();
            resolvedBlobRef.current = b;
            const u = URL.createObjectURL(b);
            revoked = u;
            setDisplayUrl(u);
          }
        }
      } catch {
        /* keep network src */
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [isOpen, imageUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, isOpen]);

  useEffect(() => {
    if (!isOpen || !usePortaledOverlay) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [isOpen, usePortaledOverlay]);

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDownloading(true);
      try {
        const img = containerRef.current?.querySelector('img');
        const outcome = await downloadImage(displayUrl, {
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
    [displayUrl, t],
  );

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsCopying(true);
      try {
        const img = containerRef.current?.querySelector('img');
        const outcome = await copyImageToClipboard(displayUrl, {
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
    [displayUrl, t],
  );

  const resetView = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomRef.current?.resetTransform();
    },
    [],
  );

  const handleViewerClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (zoomRef.current?.isZoomed()) return;
    const img = containerRef.current?.querySelector('img');
    if (!img) {
      onClose();
      return;
    }
    const { left, right, top, bottom } = img.getBoundingClientRect();
    const insideImage =
      e.clientX >= left &&
      e.clientX <= right &&
      e.clientY >= top &&
      e.clientY <= bottom;
    if (!insideImage) onClose();
  }, [onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    setSwipeOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    if (e.touches.length > 1) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;
    const deltaX = Math.abs(touch.clientX - touchStartX.current);

    if (!zoomRef.current?.isZoomed() && deltaY > 0 && deltaY > deltaX) {
      e.preventDefault();
      setSwipeOffset(deltaY);
    }
  }, []);

  const handleImageTapClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    if (e.touches.length > 0) return;

    const touch = e.changedTouches[0];
    const deltaY = touch.clientY - touchStartY.current;
    const deltaX = Math.abs(touch.clientX - (touchStartX.current || 0));

    if (!zoomRef.current?.isZoomed() && deltaY > 100 && deltaY > deltaX) {
      onClose();
    } else {
      setSwipeOffset(0);
    }

    touchStartY.current = null;
    touchStartX.current = null;
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  const captureGestures = enableTransform || usePortaledOverlay;

  const viewerBody = (
      <div 
        ref={containerRef}
        className={`fixed inset-0 z-[1] flex items-center justify-center bg-transparent ${
          captureGestures ? 'touch-none overscroll-none' : ''
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        <div 
          className="relative z-10 flex h-full w-full items-center justify-center pointer-events-auto"
          onClick={handleViewerClick}
          style={{
            transform: swipeOffset > 0 ? `translateY(${swipeOffset}px)` : 'none',
            transition: swipeOffset === 0 ? 'transform 0.2s' : 'none',
          }}
        >
          {enableTransform ? (
            <div className="relative z-10 h-full w-full min-h-0 min-w-0 pointer-events-auto">
              <FullscreenImageZoom
                ref={zoomRef}
                src={displayUrl}
                active={zoomActive}
                onTap={handleImageTapClose}
              />
            </div>
          ) : (
            <img
              src={displayUrl}
              alt="Fullscreen view"
              draggable={false}
              className="relative z-10 pointer-events-auto max-h-full max-w-full object-contain cursor-pointer"
              onClick={handleImageTapClose}
            />
          )}

          <div 
            className="absolute top-4 right-4 z-50 flex gap-3 pointer-events-auto"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)',
              right: 'max(1rem, env(safe-area-inset-right))',
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

          <div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
            style={{
              bottom: 'max(2rem, env(safe-area-inset-bottom))',
            }}
          >
            {enableTransform ? (
              <button
                onClick={resetView}
                className={`rounded-xl px-6 py-3 text-sm font-medium ${OVERLAY_CONTROL_GLASS}`}
              >
                {t('media.resetView')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
  );

  if (usePortaledOverlay) {
    const overlay = (
      <div
        className="fullscreen-backdrop-overlay fixed inset-0 z-[100] touch-none overscroll-none bg-black/80"
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
      contentClassName="fullscreen-content-fade-animate"
    >
      {viewerBody}
    </FullScreenDialog>
  );
};
