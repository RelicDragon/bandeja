import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

const clearRefreshBundleMock = vi.fn(async () => {});
const getRefreshTokenForRequestMock = vi.fn(async () => 'refresh-token');
const handleApiUnauthorizedIfNeededMock = vi.fn();
const apiRequestMock = vi.fn();
const hasExplicitLogoutMarkerMock = vi.fn(() => false);

vi.mock('@/services/refreshTokenPersistence', () => ({
  clearRefreshBundle: clearRefreshBundleMock,
  clearRefreshRequestId: vi.fn(),
  getRefreshTokenForRequest: getRefreshTokenForRequestMock,
  getOrCreateRefreshRequestId: vi.fn(() => 'refresh-request-test-123'),
  isWebHttpOnlyRefreshCookie: () => false,
  persistRefreshBundle: vi.fn(async () => {}),
  persistSessionIdOnly: vi.fn(),
}));

vi.mock('@/api/handleApiUnauthorized', () => ({
  handleApiUnauthorizedIfNeeded: handleApiUnauthorizedIfNeededMock,
}));

vi.mock('@/api/httpClient', () => ({
  api: { request: apiRequestMock },
}));

vi.mock('@/utils/authExplicitLogout', () => ({
  hasExplicitLogoutMarker: hasExplicitLogoutMarkerMock,
}));

vi.mock('@/api/apiBaseUrl', () => ({
  getApiAxiosBaseURL: () => 'https://example.test/api',
}));

vi.mock('@/utils/clientAppVersion', () => ({
  getClientAppSemver: () => '1.0.0',
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: () => false,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'web',
  },
}));

vi.mock('@/store/authAccessSink', () => ({
  applyAccessTokenFromRefresh: vi.fn(),
}));

function make401Error(): AxiosError {
  const config = {
    url: '/protected',
    headers: { Authorization: 'Bearer stale-token' },
  } as InternalAxiosRequestConfig;
  return {
    config,
    response: {
      status: 401,
      data: { code: 'auth.accessExpired' },
      statusText: 'Unauthorized',
      headers: {},
      config,
    },
    isAxiosError: true,
    name: 'AxiosError',
    message: '401',
    toJSON: () => ({}),
  } as AxiosError;
}

describe('handleAxios401MaybeRefresh', () => {
  beforeEach(() => {
    vi.resetModules();
    clearRefreshBundleMock.mockClear();
    getRefreshTokenForRequestMock.mockResolvedValue('refresh-token');
    getRefreshTokenForRequestMock.mockClear();
    handleApiUnauthorizedIfNeededMock.mockClear();
    apiRequestMock.mockClear();
    hasExplicitLogoutMarkerMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not logout when refresh fails transiently after a protected 401', async () => {
    vi.useFakeTimers();
    const axios = await import('axios');
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: vi.fn(() => Promise.reject(new Error('network timeout'))),
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');

    const promise = handleAxios401MaybeRefresh(make401Error());
    await expect(promise).rejects.toMatchObject({ response: { status: 401 } });

    expect(handleApiUnauthorizedIfNeededMock).not.toHaveBeenCalled();
    expect(clearRefreshBundleMock).not.toHaveBeenCalled();
  });

  it('force-clears the session when refresh credentials are hard rejected', async () => {
    vi.useFakeTimers();
    const axios = await import('axios');
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: vi.fn(() =>
        Promise.reject({
          isAxiosError: true,
          response: { status: 401, data: { code: 'auth.refreshExpired' } },
        }),
      ),
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');

    await expect(handleAxios401MaybeRefresh(make401Error())).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(clearRefreshBundleMock).toHaveBeenCalled();
    expect(handleApiUnauthorizedIfNeededMock).toHaveBeenCalledWith({ forceSessionClear: true });
  });

  it('does not attempt refresh after explicit logout', async () => {
    hasExplicitLogoutMarkerMock.mockReturnValue(true);
    const postMock = vi.fn();
    const axios = await import('axios');
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: postMock,
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');

    await expect(handleAxios401MaybeRefresh(make401Error())).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(getRefreshTokenForRequestMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
    expect(handleApiUnauthorizedIfNeededMock).not.toHaveBeenCalled();
  });

  it('refreshes when a 401 arrives without a Bearer header', async () => {
    const axios = await import('axios');
    apiRequestMock.mockResolvedValue({ data: { ok: true } });
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: vi.fn(async () => ({
        data: { success: true, data: { token: 'fresh-token', refreshToken: 'refresh-token' } },
      })),
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');
    const config = { url: '/me', headers: {} } as InternalAxiosRequestConfig;
    const error = {
      config,
      response: {
        status: 401,
        data: { code: 'auth.noToken' },
        statusText: 'Unauthorized',
        headers: {},
        config,
      },
      isAxiosError: true,
      name: 'AxiosError',
      message: '401',
      toJSON: () => ({}),
    } as AxiosError;

    await expect(handleAxios401MaybeRefresh(error)).resolves.toEqual({ data: { ok: true } });
    expect(handleApiUnauthorizedIfNeededMock).not.toHaveBeenCalled();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('does not logout when the same request 401s again after a successful refresh retry', async () => {
    const axios = await import('axios');
    apiRequestMock.mockRejectedValue(new Error('still unauthorized'));
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: vi.fn(async () => ({
        data: { success: true, data: { token: 'fresh-token', refreshToken: 'refresh-token' } },
      })),
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');
    const first = make401Error();
    await expect(handleAxios401MaybeRefresh(first)).rejects.toThrow('still unauthorized');

    const second = {
      ...first,
      response: {
        ...first.response!,
        data: { code: 'auth.accessExpired' },
      },
    } as AxiosError;
    await expect(handleAxios401MaybeRefresh(second)).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(handleApiUnauthorizedIfNeededMock).not.toHaveBeenCalled();
    expect(clearRefreshBundleMock).not.toHaveBeenCalled();
  });

  it('treats refresh HTTP 401 without a code as transient', async () => {
    vi.useFakeTimers();
    const axios = await import('axios');
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: vi.fn(() =>
        Promise.reject({
          isAxiosError: true,
          response: { status: 401, data: '<html>gateway</html>' },
        }),
      ),
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');

    await expect(handleAxios401MaybeRefresh(make401Error())).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(clearRefreshBundleMock).not.toHaveBeenCalled();
    expect(handleApiUnauthorizedIfNeededMock).not.toHaveBeenCalled();
  });

  it('treats malformed refresh 200 as transient', async () => {
    const axios = await import('axios');
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: vi.fn(async () => ({
        data: { success: true, data: {} },
      })),
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');

    await expect(handleAxios401MaybeRefresh(make401Error())).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(clearRefreshBundleMock).not.toHaveBeenCalled();
    expect(handleApiUnauthorizedIfNeededMock).not.toHaveBeenCalled();
  });

  it('does not logout when secure refresh storage throws', async () => {
    getRefreshTokenForRequestMock.mockRejectedValue(new Error('keystore temporarily unavailable'));
    const axios = await import('axios');
    vi.spyOn(axios.default, 'create').mockReturnValue({
      interceptors: { request: { use: vi.fn() } },
      post: vi.fn(),
    } as never);

    const { handleAxios401MaybeRefresh } = await import('@/api/authRefresh');

    await expect(handleAxios401MaybeRefresh(make401Error())).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(handleApiUnauthorizedIfNeededMock).not.toHaveBeenCalled();
    expect(clearRefreshBundleMock).not.toHaveBeenCalled();
  });
});
