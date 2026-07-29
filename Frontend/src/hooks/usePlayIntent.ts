import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playIntentsApi, type CreatePlayIntentDto } from '@/api/playIntents';
import { useAuthStore } from '@/store/authStore';
import {
  socketService,
  type PlayIntentInvalidation,
} from '@/services/socketService';

export const playIntentKeys = {
  all: ['play-intents'] as const,
  mine: (cityId?: string, sport?: string) => [...playIntentKeys.all, 'mine', cityId, sport] as const,
  /** City-scoped: myIntent may be another sport/BAR than the strip hint. */
  pool: (cityId?: string) => [...playIntentKeys.all, 'pool', cityId] as const,
  proposal: (id: string) => [...playIntentKeys.all, 'proposal', id] as const,
};

export function usePlayIntentPool(cityId?: string | null, sportHint?: string | null) {
  const isAuthenticated = useAuthStore((s) => !!s.user);
  const queryClient = useQueryClient();
  const normalizedCityId = cityId ?? undefined;
  const query = useQuery({
    queryKey: playIntentKeys.pool(cityId ?? undefined),
    queryFn: () =>
      playIntentsApi.getPool({
        cityId: cityId ?? undefined,
        sport: sportHint ?? undefined,
      }),
    enabled: isAuthenticated && !!cityId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.pendingProposal || data?.myIntent) return 2 * 60_000;
      return false;
    },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!isAuthenticated || !normalizedCityId) return;
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        void queryClient.invalidateQueries({
          queryKey: playIntentKeys.pool(normalizedCityId),
        });
      }, 75);
    };
    const handleInvalidation = (event: PlayIntentInvalidation) => {
      if (event.version !== 1 || event.cityId !== normalizedCityId) return;
      invalidate();
    };
    const unsubscribePool =
      socketService.subscribePlayIntentPool(normalizedCityId);
    const unsubscribeConnect = socketService.onConnect(invalidate);
    socketService.on('play-intent:invalidate', handleInvalidation);
    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      unsubscribePool();
      unsubscribeConnect();
      socketService.off('play-intent:invalidate', handleInvalidation);
    };
  }, [isAuthenticated, normalizedCityId, queryClient]);

  return query;
}

export function usePlayIntentMutations(_cityId?: string | null, _sport?: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: playIntentKeys.all });
  };

  const create = useMutation({
    mutationFn: (body: CreatePlayIntentDto) => playIntentsApi.create(body),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: (intentId?: string) => playIntentsApi.cancel(intentId),
    onSuccess: invalidate,
  });

  return { create, cancel, invalidate };
}
