/** Shared pile geometry for collapsed trophy stacks (rem-based; no root-font px assumptions). */
export const STACK_CARD_WIDTH_REM = 6.75;
export const STACK_CARD_GAP_REM = 0.625;
/** Inline collapse chip after expanded cards (w-7 ≈ 1.75rem). */
export const STACK_COLLAPSE_CHIP_REM = 1.75;
/** Horizontal layer offset in rem. */
export const PILE_SHIFT_X_REM = 0.44;
/** Vertical layer offset in rem (backs sit lower). */
export const PILE_SHIFT_Y_REM = 0.31;
export const FRAME_REM = 4.5;
/** Cap animated layers so large families stay light. */
export const MAX_PILE_LAYERS = 4;

export function stackExpandedWidthRem(count: number): number {
  const n = Math.max(0, count);
  const cards = n * STACK_CARD_WIDTH_REM + Math.max(0, n - 1) * STACK_CARD_GAP_REM;
  if (n === 0) return 0;
  return cards + STACK_CARD_GAP_REM + STACK_COLLAPSE_CHIP_REM;
}

/**
 * Layers to paint for a pile (worst → best so rarest ends on top).
 * Input must already be best → worst.
 */
export function selectPileLayers<T>(entries: readonly T[]): readonly T[] {
  if (entries.length <= MAX_PILE_LAYERS) {
    return [...entries].reverse();
  }
  const head = MAX_PILE_LAYERS - 1;
  const kept = [...entries.slice(0, head), entries[entries.length - 1]!];
  return kept.reverse();
}

export function pileLayerStyle(index: number, count: number): {
  zIndex: number;
  xRem: number;
  yRem: number;
  rotate: number;
  scale: number;
} {
  const safeCount = Math.max(1, count);
  const safeIndex = Math.min(Math.max(0, index), safeCount - 1);
  const topIndex = safeCount - 1;
  const depth = topIndex - safeIndex;
  const mid = topIndex / 2;
  return {
    zIndex: safeIndex,
    xRem: (safeIndex - mid) * PILE_SHIFT_X_REM,
    yRem: depth * PILE_SHIFT_Y_REM,
    rotate: (safeIndex - mid) * 2.4,
    scale: 1 - depth * 0.035,
  };
}

export function pileBoxSizeRem(count: number): { widthRem: number; heightRem: number } {
  const layers = Math.max(1, Math.min(count, MAX_PILE_LAYERS));
  return {
    widthRem: FRAME_REM + Math.max(0, layers - 1) * PILE_SHIFT_X_REM,
    heightRem: FRAME_REM + Math.max(0, layers - 1) * PILE_SHIFT_Y_REM,
  };
}

export function stackFamilyLabelKey(ruleKind: string): string {
  switch (ruleKind) {
    case 'HABIT_VOLUME':
      return 'trophies.cabinet.family.games';
    case 'HABIT_STREAK':
      return 'trophies.cabinet.family.streak';
    case 'HABIT_WINS':
      return 'trophies.cabinet.family.wins';
    case 'PODIUM':
      return 'trophies.cabinet.family.podium';
    default:
      return 'trophies.cabinet.family.generic';
  }
}

/** Scroll only the nearest horizontal scroller — avoids page jump from scrollIntoView. */
export function scrollChildIntoHorizontalView(child: HTMLElement): void {
  let parent: HTMLElement | null = child.parentElement;
  while (parent) {
    const { overflowX } = getComputedStyle(parent);
    const scrollable =
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
      parent.scrollWidth > parent.clientWidth + 1;
    if (scrollable) break;
    parent = parent.parentElement;
  }
  if (!parent) return;

  const parentRect = parent.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  const pad = 12;
  const leftOverflow = childRect.left - parentRect.left - pad;
  const rightOverflow = childRect.right - parentRect.right + pad;
  if (leftOverflow < 0) {
    parent.scrollBy({ left: leftOverflow, behavior: 'smooth' });
  } else if (rightOverflow > 0) {
    parent.scrollBy({ left: rightOverflow, behavior: 'smooth' });
  }
}
