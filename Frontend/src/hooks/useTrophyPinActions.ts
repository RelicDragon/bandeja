import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { SHOWCASE_SLOT_COUNT } from '@shared/achievements';
import type { UserStats } from '@/api/users';
import { usersApi } from '@/api/users';
import {
  applyOptimisticPin,
  applyOptimisticUnpin,
  patchUserStatsTrophies,
} from '@/utils/trophyPinOptimistic';
import type { TrophiesPayload } from '@/types/trophies';

export type TrophyPinErrorCode = 'pinsFull' | 'notFound' | 'unknown';

function mapPinError(err: unknown): TrophyPinErrorCode {
  if (!isAxiosError(err)) return 'unknown';
  const code = err.response?.data?.code;
  if (code === 'trophy.pinsFull' || err.response?.status === 409) return 'pinsFull';
  if (code === 'trophy.notFound' || err.response?.status === 404) return 'notFound';
  return 'unknown';
}

function firstFreePinSlot(trophies: TrophiesPayload | undefined): number | null {
  const used = new Set(
    (trophies?.showcase ?? []).filter((s) => s.pinned).map((s) => s.slot),
  );
  for (let slot = 0; slot < SHOWCASE_SLOT_COUNT; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

function pinsAreFull(trophies: TrophiesPayload | undefined): boolean {
  const pinnedCount = trophies?.pinnedInstanceIds?.length
    ?? (trophies?.showcase ?? []).filter((s) => s.pinned).length;
  return pinnedCount >= SHOWCASE_SLOT_COUNT;
}

export function useTrophyPinActions(ownerUserId: string | undefined) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const patchCaches = useCallback(
    (mutate: (trophies: TrophiesPayload) => TrophiesPayload) => {
      if (!ownerUserId) return;
      queryClient.setQueriesData<UserStats>({ queryKey: ['users', 'stats', ownerUserId] }, (prev) => {
        if (!prev?.user.trophies) return prev;
        return patchUserStatsTrophies(prev, mutate(prev.user.trophies));
      });
    },
    [queryClient, ownerUserId],
  );

  const refresh = useCallback(() => {
    if (!ownerUserId) return;
    void queryClient.invalidateQueries({ queryKey: ['users', 'stats', ownerUserId] });
  }, [queryClient, ownerUserId]);

  const pin = useCallback(
    async (achievementId: string) => {
      if (!ownerUserId) return;
      setBusyId(achievementId);
      const snapshots = queryClient.getQueriesData<UserStats>({
        queryKey: ['users', 'stats', ownerUserId],
      });
      const sample = snapshots.find(([, s]) => s?.user.trophies)?.[1];
      const trophies = sample?.user.trophies;
      const alreadyPinned = trophies?.pinnedInstanceIds?.includes(achievementId)
        || trophies?.showcase.some((s) => s.pinned && s.instance?.id === achievementId);

      if (!alreadyPinned && pinsAreFull(trophies)) {
        setBusyId(null);
        throw Object.assign(new Error('pins full'), { pinCode: 'pinsFull' as const });
      }

      const optimisticSlot = firstFreePinSlot(trophies);
      try {
        if (optimisticSlot != null && !alreadyPinned) {
          patchCaches((t) => applyOptimisticPin(t, achievementId, optimisticSlot));
        }
        const res = await usersApi.pinAchievement(achievementId);
        const serverSlot = res.slot ?? optimisticSlot ?? 0;
        patchCaches((t) => applyOptimisticPin(t, achievementId, serverSlot));
        refresh();
      } catch (err) {
        for (const [key, data] of snapshots) {
          queryClient.setQueryData(key, data);
        }
        throw Object.assign(err instanceof Error ? err : new Error('pin failed'), {
          pinCode: mapPinError(err),
        });
      } finally {
        setBusyId(null);
      }
    },
    [ownerUserId, patchCaches, queryClient, refresh],
  );

  const unpin = useCallback(
    async (achievementId: string) => {
      if (!ownerUserId) return;
      setBusyId(achievementId);
      const snapshots = queryClient.getQueriesData<UserStats>({
        queryKey: ['users', 'stats', ownerUserId],
      });
      try {
        patchCaches((t) => applyOptimisticUnpin(t, achievementId));
        await usersApi.unpinAchievement(achievementId);
        refresh();
      } catch (err) {
        for (const [key, data] of snapshots) {
          queryClient.setQueryData(key, data);
        }
        throw Object.assign(err instanceof Error ? err : new Error('unpin failed'), {
          pinCode: mapPinError(err),
        });
      } finally {
        setBusyId(null);
      }
    },
    [ownerUserId, patchCaches, queryClient, refresh],
  );

  return { pin, unpin, busyId, refresh };
}

export function getTrophyPinErrorCode(err: unknown): TrophyPinErrorCode {
  if (err && typeof err === 'object' && 'pinCode' in err) {
    return (err as { pinCode: TrophyPinErrorCode }).pinCode;
  }
  return mapPinError(err);
}
