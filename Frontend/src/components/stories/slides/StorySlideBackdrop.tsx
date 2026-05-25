import type { EntityType } from '@/types';
import {
  storySlideBackgroundClass,
  storySlideGlowBottomClass,
  storySlideGlowTopClass,
} from './storySlideTheme';

type StorySlideBackdropProps = {
  entityType: EntityType;
  backdropUrl?: string | null;
  /** Lighter wash for dense result layouts. */
  variant?: 'promo' | 'result';
};

export function StorySlideBackdrop({
  entityType,
  backdropUrl,
  variant = 'promo',
}: StorySlideBackdropProps) {
  const bg = storySlideBackgroundClass(entityType);
  const glowTop = storySlideGlowTopClass(entityType);
  const glowBottom = storySlideGlowBottomClass(entityType);
  const photoOpacity = variant === 'result' ? 'opacity-40' : 'opacity-45';
  const vignette =
    variant === 'result'
      ? 'from-black/15 via-transparent to-black/40'
      : 'from-black/20 via-transparent to-black/45';

  return (
    <>
      <div className={`absolute inset-0 ${bg}`} />
      <div
        className={`pointer-events-none absolute -right-10 top-16 h-56 w-56 rounded-full blur-3xl ${glowTop}`}
      />
      <div
        className={`pointer-events-none absolute -left-16 bottom-24 h-64 w-64 rounded-full blur-3xl ${glowBottom}`}
      />

      {backdropUrl ? (
        <img
          src={backdropUrl}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover saturate-[1.2] ${photoOpacity}`}
          draggable={false}
        />
      ) : null}

      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${vignette}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_0%,rgba(255,255,255,0.28),transparent_62%)]" />
    </>
  );
}
