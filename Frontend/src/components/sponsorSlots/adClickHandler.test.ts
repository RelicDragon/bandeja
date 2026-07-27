import { afterEach, describe, expect, it, vi } from 'vitest';
import { adClickNeedsLeavingConfirm, executeAdClick } from './adClickHandler';
import type { AdPlacementPayload } from '@/api/sponsorPlacements';
import { openExternalUrl } from '@/utils/openExternalUrl';

vi.mock('@/utils/openExternalUrl', () => ({
  openExternalUrl: vi.fn(),
}));

function payload(overrides: Partial<AdPlacementPayload>): AdPlacementPayload {
  return {
    campaignId: 'c1',
    creativeId: 'cr1',
    placement: 'home_hero',
    imageUrl: 'https://cdn.example/a.webp',
    clickUrl: 'https://external.example.com',
    clickAction: 'OPEN_URL',
    dismissible: true,
    clickUrlTrusted: true,
    hideDisclosure: false,
    ...overrides,
  };
}

describe('adClickNeedsLeavingConfirm', () => {
  it('skips confirm when clickUrlTrusted is true', () => {
    expect(adClickNeedsLeavingConfirm(payload({ clickUrlTrusted: true }))).toBe(false);
  });

  it('requires confirm for untrusted external URLs', () => {
    expect(
      adClickNeedsLeavingConfirm(
        payload({ clickUrlTrusted: false, clickUrl: 'https://external.example.com' }),
      ),
    ).toBe(true);
  });

  it('does not confirm for untrusted in-app paths', () => {
    expect(
      adClickNeedsLeavingConfirm(payload({ clickUrlTrusted: false, clickUrl: '/games' })),
    ).toBe(false);
  });
});

describe('executeAdClick OPEN_URL static pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('full-page navigates relative same-host static paths', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: { assign, origin: 'http://localhost:3001', href: 'http://localhost:3001/' },
    });
    const navigate = vi.fn();
    await executeAdClick(
      payload({ clickAction: 'OPEN_URL', clickUrl: '/LizaBirthday2026' }),
      navigate as never,
    );
    expect(assign).toHaveBeenCalledWith('/LizaBirthday2026');
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['Capacitor', 'https://localhost'],
    ['local web', 'http://localhost:3001'],
  ])(
    'keeps an absolute Bandeja birthday landing in the current document on %s',
    async (_surface, origin) => {
      const assign = vi.fn();
      vi.stubGlobal('window', {
        location: { assign, origin, href: `${origin}/` },
      });
      const navigate = vi.fn();

      await executeAdClick(
        payload({
          clickAction: 'OPEN_URL',
          clickUrl:
            'https://bandeja.me/LizaBirthday2026?locale=ru&theme=dark&ad_token=token',
        }),
        navigate as never,
      );

      expect(assign).toHaveBeenCalledWith(
        '/LizaBirthday2026?locale=ru&theme=dark&ad_token=token',
      );
      expect(openExternalUrl).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
