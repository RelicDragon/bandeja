/** Shared cabinet tile chrome — cards and stacks use the same slots. */
export const TROPHY_TILE_WIDTH_CLASS = 'w-[6.75rem]';
export const TROPHY_TILE_ART_SLOT_CLASS =
  'relative flex h-[4.5rem] w-full shrink-0 items-center justify-center';
/** Two-line title slot keeps every rarity tag on the same baseline. */
export const TROPHY_TILE_LABEL_SLOT_CLASS =
  'flex h-7 w-full shrink-0 items-start justify-center px-0.5';
export const TROPHY_TILE_FOOTER_SLOT_CLASS =
  'mt-auto flex w-full shrink-0 flex-col items-center gap-1.5 px-1';
export const TROPHY_TILE_PROGRESS_SLOT_CLASS = 'h-1 w-full shrink-0';
export const TROPHY_RARITY_TAG_CLASS =
  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.06em] ring-1';

export function trophyTileButtonClass(locked: boolean): string {
  const base =
    'group relative flex h-full w-full flex-col items-center gap-1.5 overflow-visible rounded-2xl px-1.5 pb-2 pt-2 text-center transition duration-200 hover:-translate-y-0.5 active:scale-[0.97]';
  if (locked) return `${base} bg-gray-50/80 dark:bg-white/[0.03]`;
  return `${base} bg-gradient-to-b from-white to-gray-50 shadow-sm ring-1 ring-black/[0.06] dark:from-white/[0.07] dark:to-white/[0.02] dark:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] dark:ring-white/[0.1]`;
}

/** Persistent natural-height frame: it widens around the same icons instead of being swapped out. */
export function trophyGroupFrameClass(locked: boolean): string {
  const base =
    'relative w-full overflow-hidden rounded-2xl border text-center shadow-sm';
  if (locked) {
    return `${base} border-gray-200/90 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03]`;
  }
  return `${base} border-black/[0.08] bg-gradient-to-b from-white to-gray-50 dark:border-white/12 dark:from-white/[0.07] dark:to-white/[0.02] dark:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]`;
}
