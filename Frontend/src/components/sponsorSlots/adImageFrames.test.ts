import { describe, expect, it } from 'vitest';
import type { AdPlacementPayload } from '@/api/sponsorPlacements';
import { resolveAdImageFrames } from './adImageFrames';

function payload(overrides: Partial<AdPlacementPayload> = {}): AdPlacementPayload {
  return {
    campaignId: 'campaign-1',
    creativeId: 'creative-1',
    placement: 'home_hero',
    imageUrl: 'light-1.webp',
    clickUrl: 'https://example.test',
    clickAction: 'OPEN_URL',
    dismissible: false,
    clickUrlTrusted: true,
    hideDisclosure: false,
    ...overrides,
  };
}

describe('resolveAdImageFrames', () => {
  it('keeps legacy single-image ads static', () => {
    expect(resolveAdImageFrames(payload(), false)).toEqual(['light-1.webp']);
  });

  it('uses imageUrl as frame zero for backward compatibility', () => {
    expect(
      resolveAdImageFrames(
        payload({ imageUrls: ['unexpected.webp', 'light-2.webp', 'light-3.webp'] }),
        false,
      ),
    ).toEqual(['light-1.webp', 'unexpected.webp', 'light-2.webp', 'light-3.webp']);
  });

  it('uses matching dark frames and falls back to light frames by index', () => {
    expect(
      resolveAdImageFrames(
        payload({
          imageUrlDark: 'dark-1.webp',
          imageUrls: ['light-1.webp', 'light-2.webp', 'light-3.webp'],
          imageUrlsDark: ['dark-1.webp', 'dark-2.webp'],
        }),
        true,
      ),
    ).toEqual(['dark-1.webp', 'dark-2.webp', 'light-3.webp']);
  });
});
