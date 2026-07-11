import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import type { Sport } from '@/sport/sportRegistry';
import { sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';
import { useQuestionnaireStatusQuery } from '@/queries/questionnaire/useQuestionnaireStatusQuery';

export function useQuestionnaireStatus(sport: Sport | null | undefined) {
  const userId = useAuthStore((s) => s.user?.id);
  const enabled = !!sport && sportHasQuestionnaire(sport);
  const { data: status = null, isLoading: loading, refetch } = useQuestionnaireStatusQuery(
    userId,
    sport,
    { enabled },
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await refetch();
  }, [enabled, refetch]);

  return { status, loading, refresh };
}
