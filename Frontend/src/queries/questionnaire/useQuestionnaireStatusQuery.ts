import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { sportQuestionnaireApi } from '@/api/sportQuestionnaire';
import type { SportQuestionnaireStatus } from '@/api/users';
import type { Sport } from '@/sport/sportRegistry';
import { sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';
import { queryKeys } from '../queryKeys';

const QUESTIONNAIRE_STATUS_STALE_TIME = 60 * 1000;

export function questionnaireStatusQueryOptions(
  userId: string | undefined,
  sport: Sport | null | undefined,
  enabled = true,
) {
  const resolvedSport = sport && sportHasQuestionnaire(sport) ? sport : ('inactive' as const);
  const isEnabled = enabled && !!userId && resolvedSport !== 'inactive';
  return queryOptions({
    queryKey: queryKeys.questionnaire.status(userId ?? '', resolvedSport),
    queryFn: async (): Promise<SportQuestionnaireStatus | null> => {
      if (!sport || !sportHasQuestionnaire(sport)) return null;
      return sportQuestionnaireApi.getStatus(sport);
    },
    staleTime: QUESTIONNAIRE_STATUS_STALE_TIME,
    enabled: isEnabled,
  });
}

export function useQuestionnaireStatusQuery(
  userId: string | undefined,
  sport: Sport | null | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!userId;
  return useQuery(questionnaireStatusQueryOptions(userId, sport, enabled));
}

export function useInvalidateQuestionnaireStatus() {
  const queryClient = useQueryClient();
  return useCallback(
    (userId: string, sport: Sport) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.questionnaire.status(userId, sport),
      });
    },
    [queryClient],
  );
}
