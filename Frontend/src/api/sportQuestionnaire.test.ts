import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGetMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
}));

vi.mock('./axios', () => ({
  default: {
    get: apiGetMock,
  },
}));

import { sportQuestionnaireApi } from './sportQuestionnaire';

describe('sportQuestionnaireApi', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    vi.spyOn(Date, 'now').mockReturnValue(1783545600000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bypasses native/webview caches for questionnaire status', async () => {
    const status = {
      completed: false,
      skipped: false,
      suggested: true,
      level: 1,
      gamesPlayed: 0,
    };
    apiGetMock.mockResolvedValue({ data: { data: status } });

    await expect(sportQuestionnaireApi.getStatus('PADEL')).resolves.toEqual(status);

    expect(apiGetMock).toHaveBeenCalledWith(
      '/users/me/sports/PADEL/questionnaire/status',
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
        params: { _t: 1783545600000 },
      },
    );
  });
});
