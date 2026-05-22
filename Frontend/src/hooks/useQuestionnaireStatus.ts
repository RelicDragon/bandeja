import { useCallback, useEffect, useState } from 'react';
import { sportQuestionnaireApi } from '@/api/sportQuestionnaire';
import type { SportQuestionnaireStatus } from '@/api/users';
import type { Sport } from '@/sport/sportRegistry';
import { sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';

export function useQuestionnaireStatus(sport: Sport | null | undefined) {
  const [status, setStatus] = useState<SportQuestionnaireStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sport || !sportHasQuestionnaire(sport)) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      setStatus(await sportQuestionnaireApi.getStatus(sport));
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}
