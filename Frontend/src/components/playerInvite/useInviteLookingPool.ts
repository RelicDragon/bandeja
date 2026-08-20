import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { playIntentsApi } from '@/api/playIntents';
import { useAuthStore } from '@/store/authStore';
import { socketService } from '@/services/socketService';
import {
  PLAY_INTENT_INVALIDATE_EVENT,
  type PlayIntentInvalidation,
} from '@shared/playIntentRealtime';
import type { InviteLookingMember, InviteLookingPool, PlayerInviteLookingDraft } from './lookingTypes';

const EMPTY_MEMBERS: InviteLookingMember[] = [];

export const inviteLookingPoolKeys = {
  all: ['play-intents', 'invite-pool'] as const,
  game: (gameId: string) => [...inviteLookingPoolKeys.all, 'game', gameId] as const,
  draft: (draftKey: string) => [...inviteLookingPoolKeys.all, 'draft', draftKey] as const,
};

function draftKey(draft: PlayerInviteLookingDraft): string {
  return [
    draft.sport,
    draft.entityType,
    draft.clubId ?? '',
    draft.startTime,
    draft.timeZone ?? '',
    draft.minLevel ?? '',
    draft.maxLevel ?? '',
    draft.genderTeams ?? '',
  ].join('|');
}

export function useInviteLookingPool(input: {
  enabled: boolean;
  gameId?: string;
  lookingDraft?: PlayerInviteLookingDraft | null;
}) {
  const isAuthenticated = useAuthStore((s) => !!s.user);
  const cityId = useAuthStore((s) => s.user?.currentCity?.id ?? s.user?.currentCityId);
  const queryClient = useQueryClient();
  const { enabled: enabledInput, gameId, lookingDraft } = input;
  const enabled = enabledInput && isAuthenticated && (!!gameId || !!lookingDraft);
  const draftFingerprint = lookingDraft ? draftKey(lookingDraft) : '';
  const key = useMemo(
    () => (gameId ? inviteLookingPoolKeys.game(gameId) : inviteLookingPoolKeys.draft(draftFingerprint)),
    [draftFingerprint, gameId],
  );

  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (gameId) return playIntentsApi.getInvitePool({ gameId });
      if (!lookingDraft) throw new Error('looking draft required');
      return playIntentsApi.getInvitePool({
        draft: {
          sport: lookingDraft.sport,
          entityType: lookingDraft.entityType,
          clubId: lookingDraft.clubId,
          startTime: lookingDraft.startTime,
          endTime: lookingDraft.endTime ?? undefined,
          timeZone: lookingDraft.timeZone ?? undefined,
          minLevel: lookingDraft.minLevel,
          maxLevel: lookingDraft.maxLevel,
          genderTeams: lookingDraft.genderTeams,
        },
      });
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const poolCityId = query.data?.cityId ?? cityId;
  const sport = query.data?.sport ?? lookingDraft?.sport;
  const entityType = query.data?.entityType ?? (lookingDraft?.entityType === 'BAR' ? 'BAR' : 'GAME');

  useEffect(() => {
    if (!enabled || !poolCityId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: key });
      }, 75);
    };
    const handleInvalidation = (event: PlayIntentInvalidation) => {
      if (event.version !== 1 || event.cityId !== poolCityId) return;
      if (sport && event.sport !== sport) return;
      if (entityType && event.entityType !== entityType) return;
      invalidate();
    };
    const unsubscribePool = socketService.subscribePlayIntentPool(poolCityId);
    const unsubscribeConnect = socketService.onConnect(invalidate);
    socketService.on(PLAY_INTENT_INVALIDATE_EVENT, handleInvalidation);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribePool();
      unsubscribeConnect();
      socketService.off(PLAY_INTENT_INVALIDATE_EVENT, handleInvalidation);
    };
  }, [enabled, entityType, key, poolCityId, queryClient, sport]);

  const members = query.data?.members ?? EMPTY_MEMBERS;
  const loadFailed = query.isError && !query.data;

  return {
    pool: query.data as InviteLookingPool | undefined,
    members,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isError: loadFailed,
    refetch: query.refetch,
    lookingCount: query.data?.total ?? 0,
    greatFitCount: members.filter((m) => m.matchesGame).length,
  };
}
