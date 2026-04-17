import { DEFAULT_REACTION_EMOJI_SEED } from '@/utils/defaultReactionEmojiSeed';

/** Same strip length everywhere: message menu, game card, and full picker (strip above catalog). */
export const REACTION_PICKER_FREQUENT_STRIP_COUNT = 11;

export function frequentReactionStripFromStore(s: { selectTopFrequent: (n: number) => string[] }): string[] {
  const top = s.selectTopFrequent(REACTION_PICKER_FREQUENT_STRIP_COUNT);
  if (top.length > 0) return top;
  return [...DEFAULT_REACTION_EMOJI_SEED].slice(0, REACTION_PICKER_FREQUENT_STRIP_COUNT);
}

/** Keeps layout stable when toggling the visible frame. */
export const REACTION_PICKER_STRIP_IDLE_FRAME = 'box-border rounded-lg border-2 border-transparent';

/** Inner frame around the glyph only (avoids overlapping adjacent strip cells). */
export const REACTION_PICKER_STRIP_SELECTED_INNER_FRAME =
  'rounded-lg border-2 border-amber-700 dark:border-amber-400';

export const REACTION_EMOJI_PICKER_PORTAL_ATTR = 'data-reaction-emoji-picker-portal';

export function isEventFromReactionEmojiPickerPortal(ev: Event): boolean {
  const path = typeof ev.composedPath === 'function' ? ev.composedPath() : ev.target != null ? [ev.target] : [];
  for (const n of path) {
    if (n instanceof Element && n.hasAttribute(REACTION_EMOJI_PICKER_PORTAL_ATTR)) return true;
  }
  return false;
}
