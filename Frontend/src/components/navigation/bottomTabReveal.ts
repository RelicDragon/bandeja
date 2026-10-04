import type { BottomTabId } from '@/utils/bottomTabActiveId';

/**
 * PRD 358 — tab ids the bottom bar last rendered, kept across remounts
 * (MainPage remounts the bar per route) so a tab revealed by a novice rank-up
 * scales in once instead of popping. `null` until the bar has rendered once.
 */
let lastRenderedTabIds: ReadonlySet<BottomTabId> | null = null;

export function readLastRenderedTabIds(): ReadonlySet<BottomTabId> | null {
  return lastRenderedTabIds;
}

export function rememberRenderedTabIds(ids: readonly BottomTabId[]): void {
  lastRenderedTabIds = new Set(ids);
}

/**
 * A full-screen page without the bar (novice Welcome) calls this so the bar's
 * next appearance — Debut rank-up or "show me everything" — slides in.
 */
export function markBottomTabBarHidden(): void {
  lastRenderedTabIds = new Set();
}
