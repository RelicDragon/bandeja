import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { SportQuestionnaireStatus } from '@/api/users';

const { getStatus } = vi.hoisted(() => ({
  getStatus: vi.fn(),
}));

vi.mock('@/api/sportQuestionnaire', () => ({
  sportQuestionnaireApi: {
    getStatus: (...args: unknown[]) => getStatus(...args),
  },
}));

import { questionnaireStatusQueryOptions } from './useQuestionnaireStatusQuery';
import { queryKeys } from '../queryKeys';

function sampleStatus(): SportQuestionnaireStatus {
  return { level: 3.5, completed: false, skipped: false } as SportQuestionnaireStatus;
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('useQuestionnaireStatusQuery', () => {
  beforeEach(() => {
    getStatus.mockReset();
    getStatus.mockResolvedValue(sampleStatus());
  });

  it('uses expected query key shape', () => {
    const options = questionnaireStatusQueryOptions('user-1', 'PADEL');
    expect(options.queryKey).toEqual(queryKeys.questionnaire.status('user-1', 'PADEL'));
  });

  it('fetches once per key within stale window', async () => {
    const client = createTestClient();
    const options = questionnaireStatusQueryOptions('user-1', 'PADEL');

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledWith('PADEL');
  });

  it('does not fetch when sport is missing', () => {
    const options = questionnaireStatusQueryOptions('user-1', null);
    expect(options.enabled).toBe(false);
  });
});
