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
import { OVERLAY_CONTROL_GLASS } from '@/components/ui/overlayControlGlass';
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

function resolveViewerMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  return resolveChatMediaUrl(url);
}

function dismissBackdropRgba(offsetY: number): string {
  const opacity = Math.max(0.28, 0.94 - offsetY / 360);
  return `rgba(0,0,0,${opacity})`;
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
          <span className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white">
            <Play size={30} fill="currentColor" />
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
  useBackButtonModal(usePortaledOverlay && isOpen, onClose, modalId);
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
  const [isZoomed, setIsZoomed] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState(false);
  const dragControls = useDragControls();
  const swipeX = useMotionValue(0);
  const videoDismissY = useMotionValue(0);
  const previousX = useTransform(swipeX, (x) => `calc(-100% + ${x}px)`);
  const nextX = useTransform(swipeX, (x) => `calc(100% + ${x}px)`);

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
    setChromeVisible(true);
    pendingOlderNavigationRef.current = false;
    sawOlderLoadingRef.current = false;
    if (isOpen) zoomRef.current?.resetTransform();
    const backdrop = overlayRef.current ?? containerRef.current;
    if (backdrop) backdrop.style.backgroundColor = dismissBackdropRgba(0);
    if (chromeLayerRef.current) {
      chromeLayerRef.current.style.opacity = '1';
    }
  }, [activeMediaId, isOpen, shownUrl, swipeX, videoDismissY]);

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

  useEffect(() => {
    const chrome = chromeLayerRef.current;
    if (!chrome) return;
    chrome.style.opacity = chromeVisible ? '1' : '0';
  }, [chromeVisible]);

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
          duration: reduceMotion ? 0 : 0.18,
          ease: 'easeOut',
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
      const width = containerRef.current?.clientWidth || window.innerWidth || 320;
      navigationAnimationRef.current?.stop();
      const controls = animate(swipeX, -delta * width, {
        duration: 0.22,
        ease: [0.22, 0.72, 0.2, 1],
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
      duration: reduceMotion ? 0 : 0.18,
      ease: 'easeOut',
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
        onClose();
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
  }, [hasMoreItemsBefore, isOpen, navigateBy, nextItem, onClose, previousItem, requestPrevious]);

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

  const handleDismissOffsetChange = useCallback((offsetY: number) => {
    const backdrop = overlayRef.current ?? containerRef.current;
    if (backdrop) backdrop.style.backgroundColor = dismissBackdropRgba(offsetY);
    const chrome = chromeLayerRef.current;
    if (chrome) {
      chrome.style.opacity = offsetY > 40 ? '0.2' : chromeVisible ? '1' : '0';
    }
  }, [chromeVisible]);

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
    zoomRef.current?.resetTransform();
    handleDismissOffsetChange(0);
  }, [handleDismissOffsetChange]);

  const handleMediaTap = useCallback(() => {
    if (mediaItems?.length) {
      setChromeVisible((visible) => !visible);
      return;
    }
    onClose();
  }, [mediaItems?.length, onClose]);

  const handleCurrentMediaClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (isVideo && !wasDraggingRef.current) handleMediaTap();
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
      onClose();
    },
    [onClose]
  );

  const handleDragStart = useCallback(() => {
    wasDraggingRef.current = true;
    if (chromeLayerRef.current) chromeLayerRef.current.style.opacity = '0';
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
          duration: reduceMotion ? 0 : 0.18,
          ease: 'easeOut',
        });
      }
      if (chromeLayerRef.current) {
        chromeLayerRef.current.style.opacity = chromeVisible ? '1' : '0';
      }
    },
    [
      chromeVisible,
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
      onClose();
      return;
    }
    animate(videoDismissY, 0, { duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' });
    handleDismissOffsetChange(0);
  }, [handleDismissOffsetChange, isVideo, onClose, reduceMotion, videoDismissY]);

  if (!isOpen || !activeItem) return null;

  const loadingOverlay = !mediaReady && !mediaLoadError ? (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      role="status"
      aria-label={t('common.loading')}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-md">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </span>
    </div>
  ) : null;
  const errorOverlay = mediaLoadError ? (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 px-6">
      <button
        type="button"
        className={`rounded-full px-5 py-3 text-sm font-semibold text-white ${OVERLAY_CONTROL_GLASS}`}
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
      className="relative flex h-full w-full items-center justify-center bg-black"
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
        aria-label={t('media.fullscreenItemLabel', {
          defaultValue: 'Media {{current}} of {{total}}',
          current: activeIndex + 1,
          total: galleryItems.length,
        })}
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
        alt={t('media.fullscreenItemLabel', {
          defaultValue: 'Media {{current}} of {{total}}',
          current: activeIndex + 1,
          total: galleryItems.length,
        })}
        active={zoomActive}
        onTap={handleMediaTap}
        onDismiss={onClose}
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
        onClick={handleMediaTap}
      >
        <img
          key={`${activeItem.id}-${retryKey}`}
          src={shownUrl}
          alt={t('media.fullscreenItemLabel', {
            defaultValue: 'Media {{current}} of {{total}}',
            current: activeIndex + 1,
            total: galleryItems.length,
          })}
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
          className="pointer-events-none absolute inset-0 z-[5] flex h-full w-full items-center justify-center bg-black"
          style={{ x: previousX }}
          aria-hidden
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-md">
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
        style={{ x: swipeX, y: videoDismissY }}
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
        {currentMedia}
      </motion.div>

      <div
        ref={chromeLayerRef}
        className="pointer-events-none absolute inset-0 z-50 transition-opacity duration-200"
        aria-hidden={!chromeVisible}
        inert={!chromeVisible}
      >
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 via-black/15 to-transparent" />

        <div
          className={`absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-3 sm:px-4 ${
            chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
          <div className="min-w-[3.25rem]">
            {galleryItems.length > 1 ? (
              <div
                className={`inline-flex h-10 items-center rounded-full px-3 text-xs font-semibold tabular-nums text-white ${OVERLAY_CONTROL_GLASS}`}
                aria-live="polite"
                data-testid="fullscreen-media-counter"
              >
                {isLoadingMoreItems && !previousItem ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {activeIndex + 1} / {galleryItems.length}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {!isVideo ? (
              <button
                type="button"
                onClick={handleCopy}
                disabled={isCopying}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${OVERLAY_CONTROL_GLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                aria-label={t('media.copyImage')}
              >
                {isCopying ? <Loader2 size={21} className="animate-spin" /> : <Copy size={21} />}
              </button>
            ) : null}
            {isVideo && pipSupported ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePiP();
                }}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${OVERLAY_CONTROL_GLASS} ${pipActive ? 'ring-2 ring-white/70' : ''}`}
                aria-label={t('chat.videoPictureInPicture', { defaultValue: 'Picture in picture' })}
              >
                <PictureInPicture2 size={21} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${OVERLAY_CONTROL_GLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              aria-label={t('media.download')}
            >
              {isDownloading ? (
                <Loader2 size={21} className="animate-spin" />
              ) : (
                <Download size={21} />
              )}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${OVERLAY_CONTROL_GLASS}`}
              aria-label={t('common.close')}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {previousItem || hasMoreItemsBefore ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              requestPrevious();
            }}
            disabled={isLoadingMoreItems}
            className={`absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-80 transition-[opacity,transform] hover:opacity-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex ${OVERLAY_CONTROL_GLASS} ${
              chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{ left: 'max(0.75rem, env(safe-area-inset-left))' }}
            aria-label={t('common.previous')}
            data-testid="fullscreen-media-previous"
          >
            {isLoadingMoreItems ? (
              <Loader2 size={23} className="animate-spin" />
            ) : (
              <ChevronLeft size={29} />
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
            className={`absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-80 transition-[opacity,transform] hover:opacity-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex ${OVERLAY_CONTROL_GLASS} ${
              chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{ right: 'max(0.75rem, env(safe-area-inset-right))' }}
            aria-label={t('common.next')}
            data-testid="fullscreen-media-next"
          >
            <ChevronRight size={29} />
          </button>
        ) : null}

        {enableTransform && !isVideo && isZoomed ? (
          <div
            className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${
              chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={resetView}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${OVERLAY_CONTROL_GLASS}`}
            >
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
        data-state="open"
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
      open={isOpen}
      onClose={onClose}
      modalId={modalId}
      title={t('media.viewerTitle', { defaultValue: 'Media viewer' })}
      closeOnInteractOutside={false}
      overlayClassName="fullscreen-backdrop-overlay"
      contentClassName="fullscreen-content-fade-animate overflow-hidden"
      bodyClassName="!overflow-hidden overscroll-none touch-none"
    >
      {viewerBody}
    </FullScreenDialog>
  );
};
