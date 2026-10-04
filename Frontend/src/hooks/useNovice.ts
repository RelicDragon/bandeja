import { useCallback, useEffect, useMemo } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  hasNoviceFeature,
  isNoviceModeActive,
  NOVICE_MAX_RANK,
  noviceProgressToRegular,
  type NoviceFeature,
} from '@shared/novice';
import { noviceApi, type NoviceState } from '@/api/novice';
import { useAuthStore } from '@/store/authStore';
import { isCapacitor } from '@/utils/capacitor';

/**
 * PRD 358 — the current user's novice state. All novice fields live on the
 * auth-store user (the profile payload carries them); this module only reads
 * them and writes server answers back.
 */

/** Merge a novice-state answer into the stored user (no-op when signed out). */
export function applyNoviceState(state: Partial<NoviceState>): void {
  const current = useAuthStore.getState().user;
  if (!current) return;
  useAuthStore.getState().updateUser({ ...current, ...state });
}

/** Re-read novice state from the server (rank-ups recorded while away). */
export async function refreshNoviceState(): Promise<NoviceState | null> {
  const auth = useAuthStore.getState();
  if (!auth.isAuthenticated || !auth.token || !auth.user) return null;
  const state = await noviceApi.get();
  applyNoviceState(state);
  return state;
}

/**
 * "Show me everything": optimistic — the shell unlocks immediately; a failed
 * request restores the previous value and rethrows so the caller can toast.
 */
export async function unlockAllNovice(): Promise<NoviceState> {
  const previous = useAuthStore.getState().user?.noviceUnlockedAllAt ?? null;
  applyNoviceState({ noviceUnlockedAllAt: previous ?? new Date().toISOString() });
  try {
    const state = await noviceApi.unlockAll();
    applyNoviceState(state);
    return state;
  } catch (error) {
    applyNoviceState({ noviceUnlockedAllAt: previous });
    throw error;
  }
}

/**
 * Acknowledge a celebrated rank (once across devices). Optimistic with the
 * server rule `seen = max(seen, min(rank, noviceRank))`.
 */
export async function markNoviceMilestoneSeen(rank: number): Promise<NoviceState | null> {
  const user = useAuthStore.getState().user;
  if (!user) return null;
  const previous = user.noviceMilestoneSeenRank ?? 0;
  const optimistic = Math.max(previous, Math.min(rank, user.noviceRank ?? 0));
  if (optimistic !== previous) applyNoviceState({ noviceMilestoneSeenRank: optimistic });
  try {
    const state = await noviceApi.markMilestoneSeen(rank);
    applyNoviceState(state);
    return state;
  } catch (error) {
    applyNoviceState({ noviceMilestoneSeenRank: previous });
    throw error;
  }
}

export function useNovice() {
  const user = useAuthStore((s) => s.user);
  const noviceRank = user?.noviceRank;
  const noviceCountedGames = user?.noviceCountedGames;
  const noviceMilestoneSeenRank = user?.noviceMilestoneSeenRank;
  const noviceUnlockedAllAt = user?.noviceUnlockedAllAt;

  const fields = useMemo(
    () => ({ noviceRank, noviceCountedGames, noviceMilestoneSeenRank, noviceUnlockedAllAt }),
    [noviceRank, noviceCountedGames, noviceMilestoneSeenRank, noviceUnlockedAllAt],
  );
  const isActive = isNoviceModeActive(fields);
  const hasFeature = useCallback(
    (feature: NoviceFeature) => hasNoviceFeature(fields, feature),
    [fields],
  );

  return {
    isActive,
    /** Effective rank for UI: Regular once novice mode is off. */
    rank: isActive ? (noviceRank ?? 0) : NOVICE_MAX_RANK,
    countedGames: noviceCountedGames ?? 0,
    milestoneSeenRank: noviceMilestoneSeenRank ?? 0,
    unlockedAllAt: noviceUnlockedAllAt ?? null,
    progress: noviceProgressToRegular(noviceCountedGames),
    hasFeature,
    unlockAll: unlockAllNovice,
    markMilestoneSeen: markNoviceMilestoneSeen,
    refresh: refreshNoviceState,
  };
}

/** Never re-ask more often than this when the app flips foreground repeatedly. */
const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30_000;

/**
 * Mount once (App). On resume / tab visible, re-reads novice state for users
 * still in novice mode, so a rank-up from results entered while the app was
 * in the background is picked up (celebration + unlocks) without a relaunch.
 */
export function useNoviceForegroundRefresh(): void {
  const userId = useAuthStore((s) => s.user?.id);
  const active = useAuthStore((s) => isNoviceModeActive(s.user));

  useEffect(() => {
    if (!userId || !active) return;
    let lastRun = 0;
    const run = () => {
      const now = Date.now();
      if (now - lastRun < FOREGROUND_REFRESH_MIN_INTERVAL_MS) return;
      lastRun = now;
      refreshNoviceState().catch(() => {
        // Best-effort: the next profile refresh carries the same fields.
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let capHandle: PluginListenerHandle | null = null;
    let disposed = false;
    if (isCapacitor()) {
      void CapApp.addListener('resume', run).then((handle) => {
        if (disposed) void handle.remove();
        else capHandle = handle;
      });
    }

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (capHandle) void capHandle.remove();
    };
  }, [userId, active]);
}
