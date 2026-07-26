import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: () => false,
}));

describe('getMarketItemShareUrl', () => {
  const originalEnv = import.meta.env.VITE_WEB_BASE_URL;

  afterEach(() => {
    import.meta.env.VITE_WEB_BASE_URL = originalEnv;
    vi.resetModules();
  });

  it('builds a public marketplace item URL', async () => {
    import.meta.env.VITE_WEB_BASE_URL = 'https://bandeja.me';
    const { getMarketItemShareUrl } = await import('./shareUrl');
    expect(getMarketItemShareUrl('item-1')).toBe('https://bandeja.me/marketplace/item-1');
  });

  it('strips trailing slash from public base', async () => {
    import.meta.env.VITE_WEB_BASE_URL = 'https://bandeja.me/';
    const { getMarketItemShareUrl } = await import('./shareUrl');
    expect(getMarketItemShareUrl('item-2')).toBe('https://bandeja.me/marketplace/item-2');
  });
});
