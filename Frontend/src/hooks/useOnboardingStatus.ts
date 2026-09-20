import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { onboardingApi, type OnboardingStatus } from '@/api/onboarding';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';

/**
 * PRD 350 — the onboarding routing state.
 *
 * One request per session: the answer only changes when this client itself
 * finishes the flow, and every mutation writes the fresh state straight back
 * into the cache. A failed request resolves to `undefined`, which the gate
 * reads as "do not redirect" — a flaky network must never trap a returning
 * user in `/welcome`.
 */
export function useOnboardingStatus(): {
  status: OnboardingStatus | undefined;
  isLoading: boolean;
} {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);

  const query = useQuery({
    queryKey: queryKeys.onboarding.status,
    queryFn: onboardingApi.getStatus,
    enabled: isAuthenticated && !isInitializing,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  return { status: query.data, isLoading: query.isPending };
}

/** Writes a fresh status into the cache without a refetch. */
export function useSetOnboardingStatusCache(): (status: OnboardingStatus) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (status: OnboardingStatus) => {
      queryClient.setQueryData(queryKeys.onboarding.status, status);
    },
    [queryClient],
  );
}
