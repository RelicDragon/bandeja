import { describe, expect, it } from 'vitest';
import { AD_PLACEMENTS } from '@/shared/adPlacements';
import { buildEffectiveSportsByPlacement } from '@/hooks/useAdPlacements';

describe('buildEffectiveSportsByPlacement', () => {
  it('seeds all placement slots with primary sport before tab registration', () => {
    const effective = buildEffectiveSportsByPlacement({}, 'PADEL');

    expect(effective).toEqual({
      [AD_PLACEMENTS.HOME_HERO]: 'PADEL',
      [AD_PLACEMENTS.FIND_TOP]: 'PADEL',
      [AD_PLACEMENTS.LEADERBOARD_BANNER]: 'PADEL',
    });
  });

  it('lets tab-specific overrides win over defaults', () => {
    const effective = buildEffectiveSportsByPlacement(
      { [AD_PLACEMENTS.FIND_TOP]: 'TENNIS' },
      'PADEL',
    );

    expect(effective[AD_PLACEMENTS.HOME_HERO]).toBe('PADEL');
    expect(effective[AD_PLACEMENTS.FIND_TOP]).toBe('TENNIS');
    expect(effective[AD_PLACEMENTS.LEADERBOARD_BANNER]).toBe('PADEL');
  });
});
