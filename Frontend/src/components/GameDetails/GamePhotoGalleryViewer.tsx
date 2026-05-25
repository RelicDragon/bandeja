import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { OVERLAY_CONTROL_GLASS } from '@/components/ui/overlayControlGlass';

type GamePhotoGalleryViewerProps = {
  images: string[];
  initialIndex: number;
  onClose: () => void;
};

function clampGalleryIndex(i: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, i), length - 1);
}

export const GamePhotoGalleryViewer = ({
  images,
  initialIndex,
  onClose,
}: GamePhotoGalleryViewerProps) => {
  const [index, setIndex] = useState(() => clampGalleryIndex(initialIndex, images.length));
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setIndex(clampGalleryIndex(initialIndex, images.length));
  }, [initialIndex, images.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : i));
  }, [images.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev]);

  const imageUrl = images[clampGalleryIndex(index, images.length)];
  if (!imageUrl) {
    return null;
  }

  const showNav = images.length > 1;

  return (
    <div
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
        const delta = endX - touchStartX.current;
        if (Math.abs(delta) > 60) {
          if (delta < 0) goNext();
          else goPrev();
        }
        touchStartX.current = null;
      }}
    >
      <FullscreenImageViewer imageUrl={imageUrl} isOpen onClose={onClose} />
      {showNav && (
        <>
          {index > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className={`fixed left-4 top-1/2 -translate-y-1/2 z-[60] flex h-12 w-12 items-center justify-center rounded-full ${OVERLAY_CONTROL_GLASS}`}
              style={{ left: 'max(1rem, env(safe-area-inset-left))' }}
            >
              <ChevronLeft size={28} />
            </button>
          )}
          {index < images.length - 1 && (
            <button
              type="button"
              onClick={goNext}
              className={`fixed right-4 top-1/2 -translate-y-1/2 z-[60] flex h-12 w-12 items-center justify-center rounded-full ${OVERLAY_CONTROL_GLASS}`}
              style={{ right: 'max(1rem, env(safe-area-inset-right))' }}
            >
              <ChevronRight size={28} />
            </button>
          )}
          <div
            className={`fixed left-1/2 -translate-x-1/2 z-[60] rounded-full px-3 py-1 text-sm ${OVERLAY_CONTROL_GLASS}`}
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
          >
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
};
