import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

describe('resolveNativeApiBaseUrl', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses production API on Capacitor when build env is localhost dev default', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
    const { isCapacitor } = await import('@/utils/capacitor');
    vi.mocked(isCapacitor).mockReturnValue(true);
    const { resolveNativeApiBaseUrl } = await import('@/api/apiBaseUrl');
    expect(resolveNativeApiBaseUrl()).toBe('https://bandeja.me/api');
  });

  it('uses production API for axios on Capacitor when build env is localhost dev default', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
    const { isCapacitor } = await import('@/utils/capacitor');
    vi.mocked(isCapacitor).mockReturnValue(true);
    const { getApiAxiosBaseURL } = await import('@/api/apiBaseUrl');
    expect(getApiAxiosBaseURL()).toBe('https://bandeja.me/api');
  });

  it('uses explicit production API on Capacitor when set in build env', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://bandeja.me/api');
    const { isCapacitor } = await import('@/utils/capacitor');
    vi.mocked(isCapacitor).mockReturnValue(true);
    const { resolveNativeApiBaseUrl } = await import('@/api/apiBaseUrl');
    expect(resolveNativeApiBaseUrl()).toBe('https://bandeja.me/api');
  });
});
