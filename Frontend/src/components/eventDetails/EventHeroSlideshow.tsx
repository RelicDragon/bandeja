import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import type { FullscreenMediaItem } from '@/components/fullscreenImageViewer/chatMediaGallery';
import { eventHeroSlides } from '@/utils/eventDetails/eventHeroSlides';
import { useGameDetailsLocalizedDisplay } from '@/hooks/useGameDetailsLocalizedDisplay';
import type { Game } from '@/types';

type EventHeroSlideshowProps = {
  game: Game;
};

export function EventHeroSlideshow({ game }: EventHeroSlideshowProps) {
  const { t } = useTranslation();
  const localized = useGameDetailsLocalizedDisplay(game);
  const slides = eventHeroSlides(game);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [page, setPage] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const title =
    localized.name?.trim() ||
    game.name ||
    t('games.entityTypes.EVENT', { defaultValue: 'Event/Ad' });

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || slides.length <= 1) return;
    const max = Math.max(el.scrollWidth - el.clientWidth, 1);
    const rtl = getComputedStyle(el).direction === 'rtl';
    const offset = rtl ? max + el.scrollLeft : el.scrollLeft;
    const next = Math.round(offset / Math.max(el.clientWidth, 1));
    setPage(Math.min(Math.max(next, 0), slides.length - 1));
  }, [slides.length]);

  const scrollToSlide = useCallback((index: number) => {
    slideRefs.current[index]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, []);

  const mediaItems = useMemo<FullscreenMediaItem[]>(
    () =>
      slides.map((slide, index) => ({
        id: slide.id,
        messageId: slide.id,
        mediaIndex: index,
        kind: 'image',
        originalUrl: slide.originalUrl,
        previewUrl: slide.previewUrl,
      })),
    [slides],
  );

  const viewerSlide = viewerIndex != null ? slides[viewerIndex] : null;

  return (
    <div className="relative w-full overflow-hidden bg-violet-950">
      {slides.length === 0 ? (
        <div className="flex aspect-[3/2] w-full max-h-[min(70vw,22rem)] items-center justify-center bg-gradient-to-br from-violet-700 via-indigo-800 to-slate-950 px-6 text-center text-sm font-medium text-white/85">
          {t('eventDetails.noHeroes', { defaultValue: 'No photos yet' })}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="scrollbar-hide flex snap-x snap-mandatory overflow-x-auto"
          onScroll={onScroll}
        >
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
              type="button"
              className="relative aspect-[3/2] min-w-full max-h-[min(70vw,22rem)] shrink-0 snap-center"
              onClick={() => setViewerIndex(index)}
            >
              <img
                src={slide.previewUrl}
                alt={t('eventDetails.heroAlt', {
                  name: title,
                  index: index + 1,
                  defaultValue: '{{name}} photo {{index}}',
                })}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={t('eventDetails.goToPhoto', {
                index: index + 1,
                defaultValue: 'Photo {{index}}',
              })}
              aria-current={index === page}
              onClick={() => scrollToSlide(index)}
              className="flex h-8 w-8 items-center justify-center"
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  index === page ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            </button>
          ))}
        </div>
      )}
      {viewerSlide && (
        <FullscreenImageViewer
          imageUrl={viewerSlide.originalUrl}
          mediaItems={mediaItems}
          initialMediaId={viewerSlide.id}
          isOpen
          usePortaledOverlay
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
