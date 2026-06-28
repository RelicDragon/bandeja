import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn(async () => ({ version: '0.96.50', build: '164' })),
  },
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: vi.fn(() => true),
  getCapacitorPlatform: vi.fn(() => 'ios'),
}));

describe('AppVersionService', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('checks native app versions against production API even when Vite env points at localhost', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        success: true,
        data: { status: 'ok' },
      },
    });

    const { AppVersionService } = await import('@/services/appVersion.service');
    await AppVersionService.checkVersion();

    expect(axios.get).toHaveBeenCalledWith(
      'https://bandeja.me/api/app/version-check',
      expect.objectContaining({
        params: {
          platform: 'ios',
          buildNumber: 164,
        },
      }),
    );
  });
});
