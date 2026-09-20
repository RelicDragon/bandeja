/**
 * The roving-tabindex keyboard model shared by every composite widget that
 * declares a composite ARIA role (`tablist`, `radiogroup`, `menu`).
 *
 * CONTRACT §7.1 requires "arrow-key support on segmented controls", and a role
 * that promises an interaction model has to implement it. The rules here are
 * the ones `components/pairs/PairSortChips.tsx` already followed by hand:
 *
 * - exactly one item is in the tab order (the selected one, or the first usable
 *   item when there is no selection);
 * - Arrow keys **on the widget's own axis** move focus — and, for
 *   automatic-activation widgets, selection — wrapping at both ends;
 * - Home / End jump to the first / last usable item, on both axes;
 * - disabled items are skipped, never focused;
 * - Arrow Left / Right mirror under `dir="rtl"` so `ar` moves the way the row
 *   actually reads.
 *
 * The axis matters: WAI-ARIA reserves Up/Down for a *vertical* composite. A
 * horizontal tab strip that swallows ArrowDown steals the keyboard user's page
 * scroll — and, with automatic activation, silently switches the tab and fires
 * `onChange` while it is at it.
 */

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] as const;

export type RovingNavKey = (typeof NAV_KEYS)[number];

export function isRovingNavKey(key: string): key is RovingNavKey {
  return (NAV_KEYS as readonly string[]).includes(key);
}

/**
 * `'both'` is for the roles WAI-ARIA really does define on both axes — a
 * `radiogroup` answers Left/Right *and* Up/Down. `tablist` and `menu` do not:
 * they have one axis, and the other one belongs to the page.
 */
export type RovingOrientation = 'horizontal' | 'vertical' | 'both';

export interface RovingNavInput {
  key: RovingNavKey;
  /** Index of the item that currently owns focus/selection, or `-1` for none. */
  currentIndex: number;
  /** One flag per item: `true` when the item can be focused. */
  enabled: readonly boolean[];
  /** `true` when the document reads right-to-left, so Arrow keys mirror. */
  rtl: boolean;
  /**
   * The widget's axis. A horizontal control answers Left/Right, a vertical one
   * Up/Down; the cross-axis keys return `null` so the caller leaves the event
   * alone and the page still scrolls. Defaults to `'both'`, which is what a
   * `radiogroup` wants — every single-axis caller passes its axis explicitly.
   */
  orientation?: RovingOrientation;
}

/** Walks `delta` steps from `from`, wrapping, and skipping disabled items. */
function step(from: number, delta: number, enabled: readonly boolean[]): number | null {
  const count = enabled.length;
  for (let hop = 1; hop <= count; hop += 1) {
    const index = (((from + delta * hop) % count) + count) % count;
    if (enabled[index]) return index;
  }
  return null;
}

/**
 * The item a nav key should move to, or `null` when the key does nothing — no
 * usable item at all, or the key belongs to the *other* axis. `Home` / `End`
 * land on the first / last enabled item whatever the axis.
 */
export function nextRovingIndex({
  key,
  currentIndex,
  enabled,
  rtl,
  orientation = 'both',
}: RovingNavInput): number | null {
  if (enabled.length === 0) return null;

  if (key === 'Home') return step(-1, 1, enabled);
  if (key === 'End') return step(enabled.length, -1, enabled);

  const keyIsVertical = key === 'ArrowUp' || key === 'ArrowDown';
  // Cross-axis keys are not ours: returning `null` keeps the caller from
  // calling `preventDefault`, so ArrowDown still scrolls a horizontal strip.
  if (orientation === 'horizontal' && keyIsVertical) return null;
  if (orientation === 'vertical' && !keyIsVertical) return null;

  let delta: number;
  if (key === 'ArrowRight') delta = rtl ? -1 : 1;
  else if (key === 'ArrowLeft') delta = rtl ? 1 : -1;
  else if (key === 'ArrowDown') delta = 1;
  else delta = -1;

  // From "nothing selected", forward starts at the first item and backward at
  // the last — the wrap-around modulo in `step` gets that for free.
  return step(currentIndex, delta, enabled);
}

/**
 * The single tab stop: the selected item when it is usable, otherwise the first
 * enabled one so the widget is never unreachable by Tab (a segmented control
 * with `allowDeselect` can legitimately have no selection).
 */
export function rovingTabIndex(selectedIndex: number, enabled: readonly boolean[]): number {
  if (selectedIndex >= 0 && enabled[selectedIndex]) return selectedIndex;
  return enabled.indexOf(true);
}

/** `true` when the document currently reads right-to-left. */
export function isDocumentRtl(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
}
