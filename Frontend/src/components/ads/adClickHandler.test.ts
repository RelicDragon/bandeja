import { describe, expect, it } from 'vitest';
import { adClickNeedsLeavingConfirm } from './adClickHandler';
import type { AdPlacementPayload } from '@/api/ads';

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
