/** Shared pile geometry for collapsed trophy stacks (rem-based; no root-font px assumptions). */
import { stackFamilyKey } from '@/components/trophies/cabinetGrouping';

export const STACK_CARD_WIDTH_REM = 6.75;
export const STACK_CARD_GAP_REM = 0.5;
/** Borderless expanded icon cell (frame + title width). */
export const STACK_ICON_CELL_REM = 4.75;
/** Let labels use the full column pitch, including the visual gap beside the icon. */
export const STACK_LABEL_WIDTH_REM = STACK_ICON_CELL_REM + STACK_CARD_GAP_REM;
/** Inline collapse chip after expanded icons (w-7 ≈ 1.75rem). */
export const STACK_COLLAPSE_CHIP_REM = 1.75;
/** Space between the persistent group frame and its icon row. */
export const STACK_FRAME_PADDING_REM = 0.5;
/** Horizontal layer offset in rem (kept small so peeks fit card chrome). */
export const PILE_SHIFT_X_REM = 0.28;
/** Vertical layer offset in rem (backs sit slightly lower; layout box stays FRAME_REM). */
export const PILE_SHIFT_Y_REM = 0.18;
export const FRAME_REM = 4.5;
/** Cap animated layers so large families stay light. */
export const MAX_PILE_LAYERS = 4;

export function stackExpandedWidthRem(count: number): number {
  const n = Math.max(0, count);
  if (n === 0) return 0;
  return (
    STACK_FRAME_PADDING_REM * 2 +
    n * STACK_ICON_CELL_REM +
    n * STACK_CARD_GAP_REM +
    STACK_COLLAPSE_CHIP_REM
  );
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
  // Layout footprint always matches a single trophy frame; peeks overflow visually.
  void count;
  return { widthRem: FRAME_REM, heightRem: FRAME_REM };
}

export function stackFamilyLabelKey(ruleKind: string): string {
  switch (stackFamilyKey(ruleKind)) {
    case 'HABIT_VOLUME':
      return 'trophies.cabinet.family.games';
    case 'HABIT_STREAK':
      return 'trophies.cabinet.family.streak';
    case 'HABIT_WINS':
      return 'trophies.cabinet.family.wins';
    case 'HABIT_ORGANIZE_GAME':
      return 'trophies.cabinet.family.rallyStarter';
    case 'HABIT_ORGANIZE_TOURNAMENT':
      return 'trophies.cabinet.family.tournamentHost';
    case 'HABIT_ORGANIZE_BAR':
      return 'trophies.cabinet.family.soulOfTheParty';
    case 'HABIT_GIANT_KILLER':
      return 'trophies.cabinet.family.giantKiller';
    case 'HABIT_DYNAMIC_DUO':
      return 'trophies.cabinet.family.dynamicDuo';
    case 'HABIT_OPEN_COURT':
      return 'trophies.cabinet.family.openCourt';
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
