import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playIntentsApi, type CreatePlayIntentDto } from '@/api/playIntents';
import { useAuthStore } from '@/store/authStore';

export const playIntentKeys = {
  all: ['play-intents'] as const,
  mine: (cityId?: string, sport?: string) => [...playIntentKeys.all, 'mine', cityId, sport] as const,
  /** City-scoped: myIntent may be another sport/BAR than the strip hint. */
  pool: (cityId?: string) => [...playIntentKeys.all, 'pool', cityId] as const,
  proposal: (id: string) => [...playIntentKeys.all, 'proposal', id] as const,
};

export function usePlayIntentPool(cityId?: string | null, sportHint?: string | null) {
  const isAuthenticated = useAuthStore((s) => !!s.user);
  return useQuery({
    queryKey: playIntentKeys.pool(cityId ?? undefined),
    queryFn: () =>
      playIntentsApi.getPool({
        cityId: cityId ?? undefined,
        sport: sportHint ?? undefined,
      }),
    enabled: isAuthenticated && !!cityId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.pendingProposal || data?.myIntent?.status === 'MATCHED') return 12_000;
      if (data?.myIntent) return 30_000;
      return false;
    },
    staleTime: 8_000,
  });
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
