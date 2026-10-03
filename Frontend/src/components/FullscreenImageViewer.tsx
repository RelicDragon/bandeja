import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  PictureInPicture2,
  Play,
  X,
  ZoomOut,
} from 'lucide-react';
import { animate, motion, useDragControls, useMotionValue, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  FullscreenImageZoom,
  type FullscreenImageZoomHandle,
} from '@/components/fullscreenImageViewer/FullscreenImageZoom';
import type { FullscreenMediaItem } from '@/components/fullscreenImageViewer/chatMediaGallery';
import toast from 'react-hot-toast';
import { copyImageToClipboard } from '@/utils/copyImageToClipboard';
import { downloadImage } from '@/utils/downloadImage';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import {
  mediaCacheKeyForSrc,
  readCachedMediaResponse,
  writeCachedMediaResponse,
} from '@/services/chat/chatMediaCache';
import { ensureChatMediaDownloaded } from '@/services/chat/chatMediaDownloadManager';
import { useChatMediaDownload } from '@/hooks/useChatMediaDownload';
import { useChatVideoPlaybackUrl } from '@/hooks/useChatVideoPlaybackUrl';
import { useVideoPlaybackStore } from '@/store/videoPlaybackStore';
import { isAndroid, isCapacitor } from '@/utils/capacitor';
import {
  isVideoPictureInPictureSupported,
  subscribeVideoPictureInPicture,
  toggleVideoPictureInPicture,
} from '@/utils/videoPictureInPicture';

interface FullscreenImageViewerProps {
  imageUrl: string;
  onClose: () => void;
  isOpen?: boolean;
  /** Chat gallery items, ordered oldest to newest within one exact chat scope. */
  mediaItems?: FullscreenMediaItem[];
  /** Stable gallery item id that was tapped. */
  initialMediaId?: string;
  onActiveMediaChange?: (mediaId: string) => void;
  /** The chat can page older messages when the gallery reaches its left edge. */
  hasMoreItemsBefore?: boolean;
  isLoadingMoreItems?: boolean;
  onRequestMoreItemsBefore?: () => void;
  sourceItemCount?: number;
  /** Pinch-zoom pan; off avoids crashes when nested under CSS transform ancestors. */
  enableTransform?: boolean;
  modalId?: string;
  /** Game details: Radix dialog breaks under pull-to-refresh transform; use portaled overlay instead. */
  usePortaledOverlay?: boolean;
}

const SINGLE_IMAGE_ID = 'fullscreen-single-image';
const SWIPE_DISTANCE_PX = 64;
const SWIPE_VELOCITY_PX_S = 520;
/** Gap between neighbouring slides while swiping. */
const SLIDE_GAP_PX = 20;
const BACKDROP_ALPHA = 0.96;
/** Drag-down distance at which the backdrop has fully faded out. */
const DISMISS_FADE_DISTANCE_PX = 320;
const CLOSE_ANIMATION_MS = 200;
const SETTLE_EASE = [0.2, 0.9, 0.25, 1] as const;
const BACKDROP_SETTLE_TRANSITION = 'background-color 320ms cubic-bezier(0.2, 0.9, 0.25, 1)';

/**
 * The viewer is always dark, so its controls ignore the app theme: smoked glass
 * with a hairline ring reads on both bright photos and the black backdrop.
 */
const VIEWER_GLASS =
  'bg-black/40 text-white ring-1 ring-inset ring-white/15 backdrop-blur-xl backdrop-saturate-150 shadow-[0_6px_20px_rgba(0,0,0,0.35)]';
const VIEWER_PRESS =
  'transition-[background-color,transform,opacity] duration-150 ease-out active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:pointer-events-none disabled:opacity-50';
const VIEWER_ICON_BUTTON = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${VIEWER_GLASS} ${VIEWER_PRESS} hover:bg-black/55 active:bg-white/20`;
/** Buttons inside the grouped action pill — the pill carries the glass. */
const VIEWER_GROUP_BUTTON = `flex h-10 w-10 items-center justify-center rounded-full text-white ${VIEWER_PRESS} hover:bg-white/10 active:bg-white/20`;

function resolveViewerMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  return resolveChatMediaUrl(url);
}

function dismissProgress(offsetY: number): number {
  return Math.min(1, Math.max(0, offsetY / DISMISS_FADE_DISTANCE_PX));
}

function dismissBackdropRgba(offsetY: number): string {
  return `rgba(0,0,0,${(BACKDROP_ALPHA * (1 - dismissProgress(offsetY))).toFixed(3)})`;
}

/** Taps on the letterbox around the media close; taps on the media itself toggle controls. */
function isPointOutsideElement(element: Element | null | undefined, x: number, y: number): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function downloadVideo(src: string, dialogTitle: string): Promise<void> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`video_download_${response.status}`);
  const blob = await response.blob();

  if (isCapacitor()) {
    const fileName = `video-${Date.now()}.mp4`;
    const directory = isAndroid() ? Directory.ExternalStorage : Directory.Data;
    await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory,
    });
    const fileUri = await Filesystem.getUri({ path: fileName, directory });
    await Share.share({ url: fileUri.uri, dialogTitle });
    return;
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `video-${Date.now()}.mp4`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

function AdjacentMediaPreview({ item }: { item: FullscreenMediaItem }) {
  const previewUrl = resolveViewerMediaUrl(item.previewUrl || item.originalUrl);
  const originalUrl = resolveViewerMediaUrl(item.originalUrl);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black" aria-hidden>
      {item.kind === 'video' ? (
        <>
          <video
            src={originalUrl}
            poster={previewUrl !== originalUrl ? previewUrl : undefined}
            muted
            playsInline
            preload="metadata"
            className="max-h-full max-w-full object-contain"
          />
          <span className={`absolute flex h-16 w-16 items-center justify-center rounded-full ${VIEWER_GLASS}`}>
            <Play size={28} fill="currentColor" className="ms-1" />
          </span>
        </>
      ) : (
        <img
          src={previewUrl}
          alt=""
          draggable={false}
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
      )}
    </div>
  );
}

export const FullscreenImageViewer: React.FC<FullscreenImageViewerProps> = ({
  imageUrl,
  onClose,
  isOpen = true,
  mediaItems,
  initialMediaId,
  onActiveMediaChange,
  hasMoreItemsBefore = false,
  isLoadingMoreItems = false,
  onRequestMoreItemsBefore,
  sourceItemCount = 0,
  enableTransform = true,
  modalId = 'fullscreen-image-viewer',
  usePortaledOverlay = false,
}) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  // Let the media settle and the overlay fade before the parent unmounts us;
  // unmounting straight away made every close a hard cut.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (reduceMotion) {
      onClose();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, CLOSE_ANIMATION_MS);
  }, [onClose, reduceMotion]);
  useEffect(() => {
    if (!isOpen) return;
    closingRef.current = false;
    setClosing(false);
  }, [isOpen]);
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );
  useBackButtonModal(usePortaledOverlay && isOpen, requestClose, modalId);
  const zoomRef = useRef<FullscreenImageZoomHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chromeLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigationAnimationRef = useRef<{ stop: () => void } | null>(null);
  const navigationTokenRef = useRef(0);
  const navigatingRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const pendingOlderNavigationRef = useRef(false);
  const sawOlderLoadingRef = useRef(false);
  const olderRequestSourceCountRef = useRef(sourceItemCount);
  const videoDismissOriginRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const videoDismissActiveRef = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [pipActive, setPipActive] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeVisibleRef = useRef(true);
  chromeVisibleRef.current = chromeVisible;
  const [isZoomed, setIsZoomed] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState(false);
  const dragControls = useDragControls();
  const swipeX = useMotionValue(0);
  const videoDismissY = useMotionValue(0);
  const previousX = useTransform(swipeX, (x) => `calc(-100% - ${SLIDE_GAP_PX}px + ${x}px)`);
  const nextX = useTransform(swipeX, (x) => `calc(100% + ${SLIDE_GAP_PX}px + ${x}px)`);
  const videoDismissScale = useTransform(
    videoDismissY,
    (y) => 1 - 0.3 * Math.min(1, Math.max(0, y) / 520)
  );

  const galleryItems = useMemo<FullscreenMediaItem[]>(() => {
    const valid = (mediaItems ?? []).filter((item) => !!item.originalUrl?.trim());
    if (valid.length > 0) return valid;
    return imageUrl
      ? [{
          id: SINGLE_IMAGE_ID,
          messageId: SINGLE_IMAGE_ID,
          mediaIndex: 0,
          kind: 'image',
          originalUrl: imageUrl,
          previewUrl: imageUrl,
        }]
      : [];
  }, [imageUrl, mediaItems]);

  const requestedInitialId =
    initialMediaId && galleryItems.some((item) => item.id === initialMediaId)
      ? initialMediaId
      : galleryItems[0]?.id ?? SINGLE_IMAGE_ID;
  const [activeMediaId, setActiveMediaId] = useState(requestedInitialId);
  const activeIndexCandidate = galleryItems.findIndex((item) => item.id === activeMediaId);
  const activeIndex = activeIndexCandidate >= 0
    ? activeIndexCandidate
    : Math.max(0, galleryItems.findIndex((item) => item.id === requestedInitialId));
  const activeItem = galleryItems[activeIndex];
  const previousItem = activeIndex > 0 ? galleryItems[activeIndex - 1] : undefined;
  const nextItem = activeIndex + 1 < galleryItems.length ? galleryItems[activeIndex + 1] : undefined;
  const shownUrl = resolveViewerMediaUrl(activeItem?.originalUrl ?? imageUrl);
  const shownPreviewUrl = resolveViewerMediaUrl(activeItem?.previewUrl ?? shownUrl);
  const isVideo = activeItem?.kind === 'video';
  const resolvedBlobRef = useRef<Blob | null>(null);
  const zoomActive = enableTransform && isOpen && !isVideo;
  const videoDownload = useChatMediaDownload(
    isVideo && shownUrl && !shownUrl.startsWith('blob:') && !shownUrl.startsWith('data:')
      ? shownUrl
      : undefined
  );
  const videoPlaybackUrl = useChatVideoPlaybackUrl(shownUrl, !!isVideo && isOpen);
  const setActiveVideo = useVideoPlaybackStore((state) => state.setActive);
  const clearIfActiveVideo = useVideoPlaybackStore((state) => state.clearIfActive);
  const fullscreenVideoPlaybackId = activeItem ? `fullscreen:${activeItem.id}` : 'fullscreen:media';

  useEffect(() => {
    if (isOpen) setActiveMediaId(requestedInitialId);
  }, [isOpen, requestedInitialId]);

  useEffect(() => {
    navigationTokenRef.current += 1;
    navigationAnimationRef.current?.stop();
    navigationAnimationRef.current = null;
    navigatingRef.current = false;
    swipeX.set(0);
    videoDismissY.set(0);
    resolvedBlobRef.current = null;
    setIsZoomed(false);
    setMediaReady(false);
    setMediaLoadError(false);
    pendingOlderNavigationRef.current = false;
    sawOlderLoadingRef.current = false;
    if (isOpen) zoomRef.current?.resetTransform();
    const backdrop = overlayRef.current ?? containerRef.current;
    if (backdrop) {
      backdrop.style.transition = 'none';
      backdrop.style.backgroundColor = dismissBackdropRgba(0);
    }
  }, [activeMediaId, isOpen, shownUrl, swipeX, videoDismissY]);

  useEffect(() => {
    if (isOpen) setChromeVisible(true);
  }, [isOpen]);

  // Cached and data-URL media can finish loading before React's event handler
  // is attached. Reconcile the native element state after every item change so
  // the loading indicator never remains over already-visible media.
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      if (isVideo) {
        const video = videoRef.current;
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          setMediaReady(true);
          setMediaLoadError(false);
        }
        return;
      }
      const image = containerRef.current?.querySelector<HTMLImageElement>(
        'img[data-fullscreen-current-image]'
      );
      if (image?.complete && image.naturalWidth > 0) {
        setMediaReady(true);
        setMediaLoadError(false);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMediaId, isOpen, isVideo, retryKey, shownUrl]);

  /**
   * Chrome opacity is painted imperatively so drags can fade it frame-by-frame
   * without re-rendering. `fade` null = settle back to the visibility state.
   */
  const paintChrome = useCallback((fade: number | null) => {
    const chrome = chromeLayerRef.current;
    if (!chrome) return;
    const base = chromeVisibleRef.current ? 1 : 0;
    chrome.style.transition = fade === null ? '' : 'none';
    chrome.style.opacity = String(fade === null ? base : base * fade);
  }, []);

  useEffect(() => {
    paintChrome(null);
  }, [chromeVisible, paintChrome]);

  useEffect(
    () => () => {
      navigationTokenRef.current += 1;
      navigationAnimationRef.current?.stop();
    },
    []
  );

  // Prefetch blobs for image copy/download only. Keep the rendered image on its
  // original URL so cache resolution never flashes or resets the zoom view.
  useEffect(() => {
    if (!isOpen || isVideo || !shownUrl) return;
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
        const response = await fetch(key, { mode: 'cors', credentials: 'omit' });
        if (cancelled || !response.ok) return;
        await writeCachedMediaResponse(key, response);
        resolvedBlobRef.current = await response.blob();
      } catch {
        /* copy/download can still use the image element or network */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isVideo, shownUrl]);

  useEffect(() => {
    if (!isOpen) return;
    for (const item of [previousItem, nextItem]) {
      if (!item || item.kind !== 'image') continue;
      const image = new Image();
      image.src = resolveViewerMediaUrl(item.originalUrl || item.previewUrl);
    }
  }, [isOpen, nextItem, previousItem]);

  useEffect(() => {
    if (!isOpen || !isVideo || !shownUrl) return;
    if (!shownUrl.startsWith('blob:') && !shownUrl.startsWith('data:')) {
      void ensureChatMediaDownloaded(shownUrl).catch(() => {});
    }
    setActiveVideo(fullscreenVideoPlaybackId);
    return () => clearIfActiveVideo(fullscreenVideoPlaybackId);
  }, [
    clearIfActiveVideo,
    fullscreenVideoPlaybackId,
    isOpen,
    isVideo,
    retryKey,
    setActiveVideo,
    shownUrl,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isVideo || !video) {
      setPipSupported(false);
      setPipActive(false);
      return;
    }
    setPipSupported(isVideoPictureInPictureSupported(video));
    return subscribeVideoPictureInPicture(video, setPipActive);
  }, [activeMediaId, isVideo, retryKey, videoPlaybackUrl]);

  const navigateBy = useCallback(
    (delta: -1 | 1) => {
      if (navigatingRef.current) return;
      const target = galleryItems[activeIndex + delta];
      if (!target) {
        navigationAnimationRef.current?.stop();
        navigationAnimationRef.current = animate(swipeX, 0, {
          duration: reduceMotion ? 0 : 0.3,
          ease: SETTLE_EASE,
        });
        return;
      }

      const navigationToken = navigationTokenRef.current + 1;
      navigationTokenRef.current = navigationToken;
      const finish = () => {
        if (navigationTokenRef.current !== navigationToken) return;
        setActiveMediaId(target.id);
        onActiveMediaChange?.(target.id);
        swipeX.set(0);
        navigatingRef.current = false;
        navigationAnimationRef.current = null;
      };
      if (reduceMotion) {
        finish();
        return;
      }

      navigatingRef.current = true;
      const width = (containerRef.current?.clientWidth || window.innerWidth || 320) + SLIDE_GAP_PX;
      navigationAnimationRef.current?.stop();
      // Finish a fast flick quicker than a slow drag or a button press.
      const remaining = Math.abs(-delta * width - swipeX.get()) / width;
      const controls = animate(swipeX, -delta * width, {
        duration: 0.16 + 0.16 * remaining,
        ease: SETTLE_EASE,
      });
      navigationAnimationRef.current = controls;
      void controls.then(finish);
    },
    [activeIndex, galleryItems, onActiveMediaChange, reduceMotion, swipeX]
  );

  const requestPrevious = useCallback(() => {
    if (
      previousItem ||
      !hasMoreItemsBefore ||
      isLoadingMoreItems ||
      !onRequestMoreItemsBefore
    ) {
      if (previousItem) navigateBy(-1);
      return;
    }
    pendingOlderNavigationRef.current = true;
    sawOlderLoadingRef.current = false;
    olderRequestSourceCountRef.current = sourceItemCount;
    onRequestMoreItemsBefore();
    navigationAnimationRef.current?.stop();
    navigationAnimationRef.current = animate(swipeX, 0, {
      duration: reduceMotion ? 0 : 0.3,
      ease: SETTLE_EASE,
    });
  }, [
    hasMoreItemsBefore,
    isLoadingMoreItems,
    navigateBy,
    onRequestMoreItemsBefore,
    previousItem,
    reduceMotion,
    sourceItemCount,
    swipeX,
  ]);

  useEffect(() => {
    if (!pendingOlderNavigationRef.current) return;
    if (isLoadingMoreItems) {
      sawOlderLoadingRef.current = true;
      return;
    }
    if (previousItem) {
      pendingOlderNavigationRef.current = false;
      sawOlderLoadingRef.current = false;
      navigateBy(-1);
      return;
    }
    if (
      hasMoreItemsBefore &&
      onRequestMoreItemsBefore &&
      sourceItemCount > olderRequestSourceCountRef.current
    ) {
      olderRequestSourceCountRef.current = sourceItemCount;
      sawOlderLoadingRef.current = false;
      onRequestMoreItemsBefore();
      return;
    }
    if (!sawOlderLoadingRef.current) return;
    pendingOlderNavigationRef.current = false;
    sawOlderLoadingRef.current = false;
  }, [
    hasMoreItemsBefore,
    isLoadingMoreItems,
    navigateBy,
    onRequestMoreItemsBefore,
    previousItem,
    sourceItemCount,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, video')) return;
      if (event.key === 'ArrowLeft' && (previousItem || hasMoreItemsBefore)) {
        event.preventDefault();
        requestPrevious();
      } else if (event.key === 'ArrowRight' && nextItem) {
        event.preventDefault();
        navigateBy(1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasMoreItemsBefore, isOpen, navigateBy, nextItem, previousItem, requestClose, requestPrevious]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [isOpen]);

  const handleDismissOffsetChange = useCallback((offsetY: number, settle = false) => {
    const backdrop = overlayRef.current ?? containerRef.current;
    if (backdrop) {
      backdrop.style.transition = settle && !reduceMotion ? BACKDROP_SETTLE_TRANSITION : 'none';
      backdrop.style.backgroundColor = dismissBackdropRgba(offsetY);
    }
    if (offsetY <= 0) {
      paintChrome(null);
    } else {
      // Controls clear out quickly so the dragged media is the only thing moving.
      paintChrome(Math.max(0, 1 - offsetY / 90));
    }
  }, [paintChrome, reduceMotion]);

  const handleDownload = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      setIsDownloading(true);
      try {
        if (isVideo) {
          await downloadVideo(videoPlaybackUrl || shownUrl, t('media.download'));
        } else {
          const image = containerRef.current?.querySelector<HTMLImageElement>(
            'img[data-fullscreen-current-image]'
          );
          const outcome = await downloadImage(shownUrl, {
            blob: resolvedBlobRef.current,
            img: image ?? undefined,
          });
          toast.success(
            outcome === 'shared' ? t('media.imageShareOpened') : t('media.imageDownloaded'),
          );
        }
      } catch (error) {
        console.error('Failed to download media:', error);
        toast.error(t('media.downloadImageFailed'));
      } finally {
        setIsDownloading(false);
      }
    },
    [isVideo, shownUrl, t, videoPlaybackUrl]
  );

  const handleCopy = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      setIsCopying(true);
      try {
        const image = containerRef.current?.querySelector<HTMLImageElement>(
          'img[data-fullscreen-current-image]'
        );
        const outcome = await copyImageToClipboard(shownUrl, {
          blob: resolvedBlobRef.current,
          img: image ?? undefined,
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
    [shownUrl, t]
  );

  const handlePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isVideoPictureInPictureSupported(video)) return;
    try {
      if (video.paused) await video.play();
      await toggleVideoPictureInPicture(video);
    } catch {
      /* unsupported or dismissed */
    }
  }, []);

  const resetView = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    zoomRef.current?.resetTransform(true);
  }, []);

  const handleMediaTap = useCallback((clientX: number, clientY: number) => {
    const media = containerRef.current?.querySelector(
      'img[data-fullscreen-current-image], video'
    );
    if (isPointOutsideElement(media, clientX, clientY)) {
      requestClose();
      return;
    }
    setChromeVisible((visible) => !visible);
  }, [requestClose]);

  const handleCurrentMediaClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (isVideo && !wasDraggingRef.current) handleMediaTap(event.clientX, event.clientY);
  }, [handleMediaTap, isVideo]);

  const retryMedia = useCallback(() => {
    setMediaLoadError(false);
    setMediaReady(false);
    setRetryKey((key) => key + 1);
  }, []);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (wasDraggingRef.current) return;
      if ((event.target as HTMLElement).closest('button, video')) return;
      if ((event.target as HTMLElement).closest('[data-fullscreen-image-zoom]')) return;
      if (zoomRef.current?.isZoomed()) return;
      requestClose();
    },
    [requestClose]
  );

  const handleDragStart = useCallback(() => {
    wasDraggingRef.current = true;
    navigationAnimationRef.current?.stop();
  }, []);

  const applySwipeOffset = useCallback(
    (offsetX: number) => {
      const movingPastStart = offsetX > 0 && !previousItem && !hasMoreItemsBefore;
      const movingPastEnd = offsetX < 0 && !nextItem;
      swipeX.set(movingPastStart || movingPastEnd ? offsetX * 0.2 : offsetX);
    },
    [hasMoreItemsBefore, nextItem, previousItem, swipeX]
  );

  const finishHorizontalSwipe = useCallback(
    (offsetX: number, velocityX: number) => {
      window.setTimeout(() => {
        wasDraggingRef.current = false;
      }, 0);
      if (
        nextItem &&
        (offsetX <= -SWIPE_DISTANCE_PX || velocityX <= -SWIPE_VELOCITY_PX_S)
      ) {
        navigateBy(1);
      } else if (
        (previousItem || hasMoreItemsBefore) &&
        (offsetX >= SWIPE_DISTANCE_PX || velocityX >= SWIPE_VELOCITY_PX_S)
      ) {
        requestPrevious();
      } else {
        navigationAnimationRef.current?.stop();
        navigationAnimationRef.current = animate(swipeX, 0, {
          duration: reduceMotion ? 0 : 0.3,
          ease: SETTLE_EASE,
        });
      }
    },
    [
      hasMoreItemsBefore,
      navigateBy,
      nextItem,
      previousItem,
      reduceMotion,
      requestPrevious,
      swipeX,
    ]
  );

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      finishHorizontalSwipe(info.offset.x, info.velocity.x);
    },
    [finishHorizontalSwipe]
  );

  const handleDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if ((!previousItem && !nextItem && !hasMoreItemsBefore) || zoomRef.current?.isZoomed()) return;
      if ((event.target as HTMLElement).closest('button')) return;
      const video = (event.target as HTMLElement).closest('video');
      if (video) {
        const rect = video.getBoundingClientRect();
        if (event.clientY >= rect.bottom - 64) return;
      }
      dragControls.start(event);
    },
    [dragControls, hasMoreItemsBefore, nextItem, previousItem]
  );

  const handleVideoTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isVideo || event.touches.length !== 1) return;
    const touch = event.touches[0];
    videoDismissOriginRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    videoDismissActiveRef.current = false;
  }, [isVideo]);

  const handleVideoTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const origin = videoDismissOriginRef.current;
    const touch = event.touches[0];
    if (!isVideo || !origin || !touch) return;
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (!videoDismissActiveRef.current) {
      if (dy < 10 || Math.abs(dy) <= Math.abs(dx)) return;
      videoDismissActiveRef.current = true;
    }
    event.preventDefault();
    videoDismissY.set(Math.max(0, dy));
    handleDismissOffsetChange(Math.max(0, dy));
  }, [handleDismissOffsetChange, isVideo, videoDismissY]);

  const handleVideoTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const origin = videoDismissOriginRef.current;
    videoDismissOriginRef.current = null;
    if (!isVideo || !origin || !videoDismissActiveRef.current) return;
    videoDismissActiveRef.current = false;
    const touch = event.changedTouches[0];
    const dy = Math.max(0, (touch?.clientY ?? origin.y) - origin.y);
    const velocityY = dy / Math.max(1, Date.now() - origin.at);
    if (dy >= 120 || (dy >= 44 && velocityY >= 0.7)) {
      const height = containerRef.current?.clientHeight || window.innerHeight;
      animate(videoDismissY, dy + height * 0.6, {
        duration: reduceMotion ? 0 : 0.32,
        ease: SETTLE_EASE,
      });
      handleDismissOffsetChange(dy + height * 0.6, true);
      requestClose();
      return;
    }
    animate(videoDismissY, 0, { duration: reduceMotion ? 0 : 0.32, ease: SETTLE_EASE });
    handleDismissOffsetChange(0, true);
  }, [handleDismissOffsetChange, isVideo, reduceMotion, requestClose, videoDismissY]);

  if (!isOpen || !activeItem) return null;

  const mediaLabel = t('media.fullscreenItemLabel', {
    defaultValue: 'Media {{current}} of {{total}}',
    current: activeIndex + 1,
    total: galleryItems.length,
  });
  const hasPrevious = !!previousItem || hasMoreItemsBefore;
  const showZoomReset = enableTransform && !isVideo && isZoomed;

  const loadingOverlay = !mediaReady && !mediaLoadError ? (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      role="status"
      aria-label={t('common.loading')}
      // Delayed so cached media never flashes a spinner.
      style={{ animation: reduceMotion ? undefined : 'overlay-fade-in 200ms ease-out 180ms both' }}
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-full ${VIEWER_GLASS}`}>
        <Loader2 className="h-7 w-7 animate-spin text-white/90" />
      </span>
    </div>
  ) : null;
  const errorOverlay = mediaLoadError ? (
    <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
      <button
        type="button"
        className={`h-11 rounded-full px-6 text-sm font-semibold ${VIEWER_GLASS} ${VIEWER_PRESS} hover:bg-black/55`}
        onClick={(event) => {
          event.stopPropagation();
          retryMedia();
        }}
      >
        {t('common.retry', { defaultValue: 'Retry' })}
      </button>
    </div>
  ) : null;
  const currentMedia = isVideo ? (
    <div
      className="relative flex h-full w-full items-center justify-center"
      data-testid="fullscreen-media-video"
    >
      {loadingOverlay}
      {errorOverlay}
      <video
        ref={videoRef}
        key={`${activeItem.id}-${videoPlaybackUrl}-${retryKey}`}
        src={videoPlaybackUrl || shownUrl}
        poster={shownPreviewUrl !== shownUrl ? shownPreviewUrl : undefined}
        controls
        playsInline
        aria-label={mediaLabel}
        disablePictureInPicture={false}
        className="max-h-full max-w-full object-contain"
        onCanPlay={() => setMediaReady(true)}
        onPlaying={() => setMediaReady(true)}
        onWaiting={() => setMediaReady(false)}
        onError={() => {
          setMediaReady(false);
          setMediaLoadError(true);
        }}
        onLoadedData={() => {
          const video = videoRef.current;
          if (!video) return;
          video.muted = false;
          void video.play().catch(() => {});
        }}
        onPlay={() => setActiveVideo(fullscreenVideoPlaybackId)}
      />
      {videoDownload.state === 'downloading' && videoDownload.progress > 0 ? (
        <div className="absolute bottom-0 left-0 right-0 z-10 h-0.5 bg-white/15">
          <div
            className="h-full bg-white/75 transition-[width] duration-150"
            style={{ width: `${Math.round(videoDownload.progress * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  ) : enableTransform ? (
    <div className="relative h-full w-full" data-testid="fullscreen-media-image">
      {loadingOverlay}
      {errorOverlay}
      <FullscreenImageZoom
        key={`${activeItem.id}-${retryKey}`}
        ref={zoomRef}
        src={shownUrl}
        alt={mediaLabel}
        active={zoomActive}
        onTap={handleMediaTap}
        onDismiss={requestClose}
        onDismissOffsetChange={handleDismissOffsetChange}
        onZoomChange={setIsZoomed}
        onHorizontalSwipeStart={handleDragStart}
        onHorizontalSwipeMove={applySwipeOffset}
        onHorizontalSwipeEnd={(offsetX, velocityX) =>
          finishHorizontalSwipe(offsetX, velocityX * 1000)
        }
        onLoad={() => setMediaReady(true)}
        onError={() => {
          setMediaReady(false);
          setMediaLoadError(true);
        }}
      />
    </div>
  ) : (
    <div className="relative h-full w-full" data-testid="fullscreen-media-image">
      {loadingOverlay}
      {errorOverlay}
      <button
        type="button"
        className="flex h-full w-full items-center justify-center border-0 bg-transparent p-0"
        onClick={(event) => handleMediaTap(event.clientX, event.clientY)}
      >
        <img
          key={`${activeItem.id}-${retryKey}`}
          src={shownUrl}
          alt={mediaLabel}
          draggable={false}
          decoding="async"
          fetchPriority="high"
          data-fullscreen-current-image=""
          onLoad={() => setMediaReady(true)}
          onError={() => {
            setMediaReady(false);
            setMediaLoadError(true);
          }}
          className="max-h-full max-w-full object-contain"
        />
      </button>
    </div>
  );

  const viewerBody = (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[1] flex items-center justify-center overflow-hidden bg-transparent touch-none overscroll-none"
      onClick={handleBackdropClick}
      style={{
        backgroundColor: usePortaledOverlay ? 'transparent' : dismissBackdropRgba(0),
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      {previousItem ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
          style={{ x: previousX }}
        >
          <AdjacentMediaPreview item={previousItem} />
        </motion.div>
      ) : hasMoreItemsBefore ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[5] flex h-full w-full items-center justify-center"
          style={{ x: previousX }}
          aria-hidden
        >
          <span className={`flex h-14 w-14 items-center justify-center rounded-full ${VIEWER_GLASS}`}>
            <Loader2 className="h-7 w-7 animate-spin text-white/85" />
          </span>
        </motion.div>
      ) : null}
      {nextItem ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
          style={{ x: nextX }}
        >
          <AdjacentMediaPreview item={nextItem} />
        </motion.div>
      ) : null}

      <motion.div
        className="absolute inset-0 z-10 h-full w-full min-h-0 min-w-0 pointer-events-auto"
        style={{ x: swipeX, y: videoDismissY, scale: videoDismissScale }}
        drag={isVideo ? 'x' : false}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0.14}
        onPointerDown={isVideo ? handleDragPointerDown : undefined}
        onDragStart={handleDragStart}
        onDrag={(_event, info) => applySwipeOffset(info.offset.x)}
        onDragEnd={handleDragEnd}
        onTouchStart={handleVideoTouchStart}
        onTouchMove={handleVideoTouchMove}
        onTouchEnd={handleVideoTouchEnd}
        onTouchCancel={handleVideoTouchEnd}
        onClick={handleCurrentMediaClick}
      >
        <motion.div
          className="h-full w-full"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
          animate={closing ? { opacity: 0, scale: 0.96 } : { opacity: 1, scale: 1 }}
          transition={{ duration: closing ? CLOSE_ANIMATION_MS / 1000 : 0.34, ease: SETTLE_EASE }}
        >
          {currentMedia}
        </motion.div>
      </motion.div>

      <div
        ref={chromeLayerRef}
        className="pointer-events-none absolute inset-0 z-50 transition-opacity duration-200 ease-out"
        aria-hidden={!chromeVisible}
        inert={!chromeVisible}
        data-testid="fullscreen-media-chrome"
      >
        <div
          className={`absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 via-black/25 to-transparent transition-opacity duration-300 ${
            chromeVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <div
          className={`absolute inset-x-0 top-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] ${
            chromeVisible ? 'pointer-events-auto translate-y-0' : 'pointer-events-none -translate-y-3'
          }`}
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.625rem)',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
          <div className="flex justify-start">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                requestClose();
              }}
              className={VIEWER_ICON_BUTTON}
              aria-label={t('common.close')}
            >
              <X size={22} strokeWidth={2.25} />
            </button>
          </div>

          <div className="flex justify-center">
            {galleryItems.length > 1 ? (
              <div
                className={`inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold tabular-nums tracking-wide text-white/95 ${VIEWER_GLASS}`}
                aria-live="polite"
                data-testid="fullscreen-media-counter"
              >
                {isLoadingMoreItems && !previousItem ? (
                  <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {activeIndex + 1} / {galleryItems.length}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <div className={`flex items-center gap-0.5 rounded-full p-0.5 ${VIEWER_GLASS}`}>
              {!isVideo ? (
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={isCopying}
                  className={VIEWER_GROUP_BUTTON}
                  aria-label={t('media.copyImage')}
                >
                  {isCopying ? <Loader2 size={19} className="animate-spin" /> : <Copy size={19} />}
                </button>
              ) : null}
              {isVideo && pipSupported ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handlePiP();
                  }}
                  className={`${VIEWER_GROUP_BUTTON} ${pipActive ? 'bg-white/20' : ''}`}
                  aria-label={t('chat.videoPictureInPicture', { defaultValue: 'Picture in picture' })}
                  aria-pressed={pipActive}
                >
                  <PictureInPicture2 size={19} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className={VIEWER_GROUP_BUTTON}
                aria-label={t('media.download')}
              >
                {isDownloading ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <Download size={19} />
                )}
              </button>
            </div>
          </div>
        </div>

        {hasPrevious ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              requestPrevious();
            }}
            disabled={isLoadingMoreItems}
            className={`absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full sm:flex ${VIEWER_GLASS} ${VIEWER_PRESS} hover:bg-black/55 ${
              chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{ left: 'max(1rem, env(safe-area-inset-left))' }}
            aria-label={t('common.previous')}
            data-testid="fullscreen-media-previous"
          >
            {isLoadingMoreItems ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <ChevronLeft size={26} strokeWidth={2.25} className="-ms-0.5" />
            )}
          </button>
        ) : null}

        {nextItem ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              navigateBy(1);
            }}
            className={`absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full sm:flex ${VIEWER_GLASS} ${VIEWER_PRESS} hover:bg-black/55 ${
              chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{ right: 'max(1rem, env(safe-area-inset-right))' }}
            aria-label={t('common.next')}
            data-testid="fullscreen-media-next"
          >
            <ChevronRight size={26} strokeWidth={2.25} className="-me-0.5" />
          </button>
        ) : null}

        {enableTransform && !isVideo ? (
          <div
            className={`absolute inset-x-0 bottom-0 flex justify-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] ${
              showZoomReset ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
            }`}
            style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
          >
            <button
              type="button"
              onClick={resetView}
              tabIndex={showZoomReset ? 0 : -1}
              aria-hidden={!showZoomReset}
              className={`flex h-10 items-center gap-2 rounded-full ps-3.5 pe-4 text-sm font-semibold ${VIEWER_GLASS} ${VIEWER_PRESS} hover:bg-black/55 ${
                showZoomReset && chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <ZoomOut size={17} />
              {t('media.resetView')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (usePortaledOverlay) {
    const overlay = (
      <div
        ref={overlayRef}
        className="fullscreen-backdrop-overlay fixed inset-0 z-[100] touch-none overscroll-none"
        style={{ backgroundColor: dismissBackdropRgba(0) }}
        data-state={closing ? 'closed' : 'open'}
        role="dialog"
        aria-modal="true"
        aria-label={t('media.viewerTitle', { defaultValue: 'Media viewer' })}
      >
        {viewerBody}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
  }

  return (
    <FullScreenDialog
      // Closing flips Radix to its exit animation while we stay mounted.
      open={isOpen && !closing}
      onClose={requestClose}
      modalId={modalId}
      title={t('media.viewerTitle', { defaultValue: 'Media viewer' })}
      closeOnInteractOutside={false}
      // The viewer paints its own (drag-fading) black; the overlay only blurs the app behind.
      overlayClassName="fullscreen-backdrop-overlay !bg-transparent"
      contentClassName="fullscreen-content-fade-animate overflow-hidden"
      bodyClassName="!overflow-hidden overscroll-none touch-none"
    >
      {viewerBody}
    </FullScreenDialog>
  );
};
