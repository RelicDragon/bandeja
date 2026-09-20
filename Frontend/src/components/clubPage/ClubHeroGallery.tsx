import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClubPhoto } from '@/types';

type ClubHeroGalleryProps = {
  photos: ClubPhoto[];
  clubName: string;
  /** 0 → fully expanded hero, 1 → collapsed. Drives the parallax lift. */
  parallaxOffset: number;
  reducedMotion: boolean;
  onOpenPhoto?: (url: string) => void;
};

/**
 * PRD 354 — swipeable club photo gallery behind the hero.
 *
 * Native scroll-snap rather than a JS carousel: it keeps momentum scrolling on
 * iOS, mirrors for free in RTL (the track is laid out with logical flow), and
 * costs nothing on first paint. Only the first image is eager; the rest are
 * `loading="lazy"` because this page doubles as a public landing page.
 *
 * The track is a labelled `role="region"` and is keyboard-pageable with the
 * arrow keys; the dots are `aria-hidden` because the live region announces the
 * page instead.
 */
export function ClubHeroGallery({
  photos,
  clubName,
  parallaxOffset,
  reducedMotion,
  onOpenPhoto,
}: ClubHeroGalleryProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const regionId = useId();

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    // `Math.abs` so RTL's negative scrollLeft resolves to the same page index.
    const next = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    setIndex((current) => (current === next ? current : next));
  }, []);

  const goTo = useCallback(
    (next: number) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = Math.max(0, Math.min(photos.length - 1, next));
      const direction = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
      track.scrollTo({
        left: direction * clamped * track.clientWidth,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      setIndex(clamped);
    },
    [photos.length, reducedMotion],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (photos.length < 2) return;
      // Logical paging: "next" follows reading order, so it mirrors in `ar`.
      const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(index + (rtl ? -1 : 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(index + (rtl ? 1 : -1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        goTo(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goTo(photos.length - 1);
      }
    },
    [goTo, index, photos.length],
  );

  useEffect(() => {
    if (index > photos.length - 1) setIndex(0);
  }, [index, photos.length]);

  if (photos.length === 0) {
    return (
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700"
        aria-hidden
      />
    );
  }

  const parallax = reducedMotion ? 0 : parallaxOffset;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        ref={trackRef}
        id={regionId}
        role="region"
        aria-roledescription={t('clubPage.gallery.roleDescription')}
        aria-label={t('clubPage.gallery.label', { club: clubName })}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{ transform: `translate3d(0, ${parallax}px, 0)` }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
      >
        {photos.map((photo, i) => (
          <div
            key={photo.originalUrl}
            className="relative h-full w-full shrink-0 snap-center snap-always"
            role="group"
            aria-roledescription={t('clubPage.gallery.slideRole')}
            aria-label={t('clubPage.gallery.slide', { current: i + 1, total: photos.length })}
          >
            <img
              src={i === 0 ? photo.originalUrl : photo.thumbnailUrl || photo.originalUrl}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={i === 0 ? 'high' : 'low'}
              onClick={onOpenPhoto ? () => onOpenPhoto(photo.originalUrl) : undefined}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10"
        aria-hidden
      />

      {photos.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center gap-1.5" aria-hidden>
          {photos.map((photo, i) => (
            <span
              key={photo.originalUrl}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {t('clubPage.gallery.slide', { current: index + 1, total: photos.length })}
      </p>
    </div>
  );
}
