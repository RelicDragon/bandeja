import { afterEach, describe, expect, it, vi } from 'vitest';
import { BooktimeClient } from './client';

describe('BooktimeClient.refreshAccessToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses POST on the private refresh endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new BooktimeClient({
      companyId: '002f8a6a-6433-490f-9bae-726b98399672',
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    });

    await expect(client.refreshAccessToken()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.booktime.rs/users/refresh-token');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer old-access',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      refreshToken: 'old-refresh',
      companyId: '002f8a6a-6433-490f-9bae-726b98399672',
    });
    expect(client.getTokens()).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('posts to the private refresh endpoint even without an access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new BooktimeClient({
      companyId: '002f8a6a-6433-490f-9bae-726b98399672',
      refreshToken: 'old-refresh',
    });

    await expect(client.refreshAccessToken()).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.booktime.rs/users/refresh-token');
    expect(init.method).toBe('POST');
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});
