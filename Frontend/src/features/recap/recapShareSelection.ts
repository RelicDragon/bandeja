import type { RecapSlide } from '@/api/recap';

/**
 * PRD 353 — which slides the share sheet ticks on open.
 *
 * Everything is on by default **except** a slide the payload marked
 * `sensitive`, which today means exactly one thing: the level went down. A bad
 * month is the user's business; they can still tick it themselves.
 */
export function defaultSharedSlideKeys(slides: RecapSlide[]): string[] {
  return slides.filter((slide) => !slide.sensitive).map((slide) => slide.key);
}

/**
 * Re-opening the sheet after a share restores what was actually published,
 * as long as those slides still exist in the payload.
 */
export function initialSharedSlideKeys(
  slides: RecapSlide[],
  sharedSlideKeys: string[],
): string[] {
  if (sharedSlideKeys.length === 0) return defaultSharedSlideKeys(slides);
  const known = new Set(slides.map((slide) => slide.key));
  const restored = sharedSlideKeys.filter((key) => known.has(key));
  return restored.length > 0 ? restored : defaultSharedSlideKeys(slides);
}

/** Toggling keeps the payload's slide order, never the click order. */
export function toggleSharedSlideKey(
  slides: RecapSlide[],
  selected: string[],
  key: string,
): string[] {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return slides.filter((slide) => next.has(slide.key)).map((slide) => slide.key);
}

/** The Share button stays disabled until at least one slide is ticked. */
export function canShareSelection(selected: string[]): boolean {
  return selected.length > 0;
}
