import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'web'),
  },
}));

import { BooktimeClient } from './client';

describe('BooktimeClient.signUp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends android|ios platform, not web', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new BooktimeClient({ companyId: '002f8a6a-6433-490f-9bae-726b98399672' });
    await client.signUp({
      firstName: 'Margo',
      lastName: 'Babenko',
      email: 'test@mail.ru',
      countryCode: '+381',
      phoneNumber: '507708732',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { platform: string };
    expect(body.platform).toBe('android');
    expect(body.platform).not.toBe('web');
  });
});
