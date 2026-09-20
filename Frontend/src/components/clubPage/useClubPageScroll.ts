import { useCallback, useEffect, useRef, useState } from 'react';

/** Pixels of scroll over which the hero collapses into the sticky header. */
export const CLUB_HERO_COLLAPSE_PX = 180;
/** PRD 354 — hero parallax runs at 0.3× the scroll speed. */
export const CLUB_HERO_PARALLAX_FACTOR = 0.3;

export type ClubPageScrollState = {
  /** 0 → hero fully expanded, 1 → sticky header fully shown. */
  progress: number;
  /** Pixels to lift the hero image by, already scaled. */
  parallaxOffset: number;
};

export function clubHeroScrollState(scrollTop: number, reducedMotion: boolean): ClubPageScrollState {
  const clamped = Math.max(0, scrollTop);
  const progress = Math.min(1, clamped / CLUB_HERO_COLLAPSE_PX);
  return {
    progress,
    parallaxOffset: reducedMotion ? 0 : clamped * CLUB_HERO_PARALLAX_FACTOR,
  };
}

/**
 * PRD 354 — scroll progress for the collapsing hero.
 *
 * Reads from the nearest scroll container (`MainPage` scrolls the window on
 * this place) through a rAF-throttled listener, so the sticky header and the
 * parallax share one measurement instead of two competing ones.
 */
export function useClubPageScroll(reducedMotion: boolean): ClubPageScrollState {
  const [state, setState] = useState<ClubPageScrollState>({ progress: 0, parallaxOffset: 0 });
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    frameRef.current = null;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const next = clubHeroScrollState(scrollTop, reducedMotion);
    setState((current) =>
      Math.abs(current.progress - next.progress) < 0.01 &&
      Math.abs(current.parallaxOffset - next.parallaxOffset) < 0.5
        ? current
        : next,
    );
  }, [reducedMotion]);

  useEffect(() => {
    const onScroll = () => {
      if (frameRef.current != null) return;
      frameRef.current = window.requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [measure]);

  return state;
}
